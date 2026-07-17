/**
 * ChronicleIndex — Chronicle Store layer 2 (ARCHITECTURE.md §8).
 *
 * A disposable SQLite cache over the EventLog. All reads any surface shows
 * come from here; deleting `.cache/index.db` is always safe. The indexer is
 * an incremental consumer of the log: a per-stream-file cursor (count of
 * events consumed — sound because streams are append-only) lets `catchUp`
 * skip work already done. A schema-version mismatch rebuilds; migrations do
 * not exist.
 *
 * better-sqlite3 is loaded lazily inside `open()` (ADR-0008) so non-index
 * code paths never pay native-module startup.
 */
import { createRequire } from "node:module";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import type BetterSqlite3 from "better-sqlite3";
import {
  type ChronicleEvent,
  type SessionId,
} from "@gigaichronicle/schema";
import type { EventLog } from "../store/event-log.js";
import { DDL, INDEX_SCHEMA_VERSION } from "./ddl.js";
import { extractSearchText } from "./text.js";

export interface TimelineQuery {
  from?: string;
  to?: string;
  types?: readonly string[];
  branch?: string;
  session?: SessionId;
  /** Capturing provider id (normalized, no version) — e.g. "claude-code". */
  provider?: string;
  /** Model identifier as the tool reported it. */
  model?: string;
  limit?: number;
  /** Take the most RECENT limit-sized window (returned in chronological order). */
  latest?: boolean;
}

export interface SessionSummary {
  id: string;
  started: string | null;
  ended: string | null;
  provider: string | null;
  model: string | null;
  title: string | null;
  events: number;
  /** Every provider that contributed events to this session (badges). */
  providers: string[];
  /** Every model that answered in this session (badges). */
  models: string[];
}

export interface SearchHit {
  event: ChronicleEvent;
  snippet: string;
}

export interface CorrelatedLink {
  commit: string;
  session: string;
  confidence: "exact" | "high" | "inferred";
  source: string;
}

export interface IndexFreshness {
  fresh: boolean;
  eventsIndexed: number;
  eventsInLog: number;
}

const CURSOR_PREFIX = "cursor:";

export class ChronicleIndex {
  readonly #db: BetterSqlite3.Database;

  private constructor(db: BetterSqlite3.Database) {
    this.#db = db;
  }

  /** Open (or create) the index at `.cache/index.db`; rebuild on version bump. */
  static open(chronicleDir: string): ChronicleIndex {
    const cacheDir = path.join(chronicleDir, ".cache");
    mkdirSync(cacheDir, { recursive: true });
    const file = path.join(cacheDir, "index.db");

    // Lazy native load (ADR-0008).
    const require = createRequire(import.meta.url);
    const Database = require("better-sqlite3") as typeof BetterSqlite3;

    let db = new Database(file);
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");

    // Version check BEFORE any DDL: running a newer schema's DDL against an
    // older file can itself error (e.g. an index on a column that doesn't
    // exist yet) — found upgrading the live dogfood store v1→v2. An
    // unreadable/absent version on a non-empty file is treated as stale.
    const version = safeReadVersion(db);
    if (version !== null && version !== INDEX_SCHEMA_VERSION) {
      // Version mismatch → rebuild-from-scratch is the only migration (§8).
      db.close();
      rmSync(file, { force: true });
      rmSync(`${file}-wal`, { force: true });
      rmSync(`${file}-shm`, { force: true });
      db = new Database(file);
      db.pragma("journal_mode = WAL");
      db.pragma("synchronous = NORMAL");
    }
    db.exec(DDL);
    writeMeta(db, "index_schema_version", String(INDEX_SCHEMA_VERSION));
    return new ChronicleIndex(db);
  }

  /** Consume new log events past the per-file cursors. Returns count indexed. */
  async catchUp(log: EventLog): Promise<number> {
    const consumed = new Map<string, number>();
    for (const row of this.#db
      .prepare(`SELECT key, value FROM meta WHERE key LIKE '${CURSOR_PREFIX}%'`)
      .all() as Array<{ key: string; value: string }>) {
      consumed.set(row.key.slice(CURSOR_PREFIX.length), Number(row.value));
    }

    const pending: Array<{ event: ChronicleEvent; file: string }> = [];
    const seen = new Map<string, number>();
    for await (const { event, file } of log.scan({ visibility: "all" })) {
      const position = (seen.get(file) ?? 0) + 1;
      seen.set(file, position);
      if (position > (consumed.get(file) ?? 0)) pending.push({ event, file });
    }

    const insertAll = this.#db.transaction((batch: typeof pending) => {
      for (const { event, file } of batch) this.#indexEvent(event, file);
      for (const [file, count] of seen) {
        writeMeta(this.#db, `${CURSOR_PREFIX}${file}`, String(count));
      }
    });
    insertAll(pending);
    return pending.length;
  }

  /** Drop all derived rows and re-consume the whole log. */
  async rebuild(log: EventLog): Promise<number> {
    this.#db.exec(
      "DELETE FROM events; DELETE FROM sessions; DELETE FROM files_touched; " +
        "DELETE FROM links; DELETE FROM events_fts; " +
        `DELETE FROM meta WHERE key LIKE '${CURSOR_PREFIX}%';`,
    );
    return this.catchUp(log);
  }

  /** Cursor totals vs the log's actual event counts. */
  async freshness(log: EventLog): Promise<IndexFreshness> {
    let eventsInLog = 0;
    for await (const _ of log.scan({ visibility: "all" })) eventsInLog += 1;
    const eventsIndexed = (
      this.#db.prepare("SELECT COUNT(*) AS n FROM events").get() as { n: number }
    ).n;
    return { fresh: eventsIndexed === eventsInLog, eventsIndexed, eventsInLog };
  }

  // ---------------------------------------------------------------- queries

  timeline(query: TimelineQuery = {}): ChronicleEvent[] {
    const where: string[] = ["visibility = 'shared'"];
    const params: unknown[] = [];
    if (query.from !== undefined) {
      where.push("ts >= ?");
      params.push(query.from);
    }
    if (query.to !== undefined) {
      where.push("ts <= ?");
      params.push(query.to);
    }
    if (query.types !== undefined && query.types.length > 0) {
      where.push(`type IN (${query.types.map(() => "?").join(",")})`);
      params.push(...query.types);
    }
    if (query.branch !== undefined) {
      where.push("branch = ?");
      params.push(query.branch);
    }
    if (query.session !== undefined) {
      where.push("session = ?");
      params.push(query.session);
    }
    if (query.provider !== undefined) {
      where.push("provider = ?");
      params.push(query.provider);
    }
    if (query.model !== undefined) {
      where.push("model = ?");
      params.push(query.model);
    }
    params.push(query.limit ?? 1000);
    const order = query.latest === true ? "ts DESC, id DESC" : "ts, id";
    const rows = this.#db
      .prepare(`SELECT json FROM events WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ?`)
      .all(...params) as Array<{ json: string }>;
    if (query.latest === true) rows.reverse(); // window reads oldest → newest
    return rows.map((row) => JSON.parse(row.json) as ChronicleEvent);
  }

  sessions(): SessionSummary[] {
    const rows = this.#db
      .prepare(
        `SELECT s.id,
                (SELECT MIN(e2.ts) FROM events e2 WHERE e2.session = s.id) AS started,
                s.ended, s.provider, s.model, s.title,
                (SELECT COUNT(*) FROM events e WHERE e.session = s.id) AS events
         FROM sessions s ORDER BY started, s.id`,
      )
      .all() as Array<Omit<SessionSummary, "providers" | "models">>;
    const providersFor = this.#db.prepare(
      "SELECT DISTINCT provider FROM events WHERE session = ? AND provider IS NOT NULL ORDER BY provider",
    );
    const modelsFor = this.#db.prepare(
      // "<...>"-wrapped values are tool-internal markers, not model identities.
      "SELECT DISTINCT model FROM events WHERE session = ? AND model IS NOT NULL AND model NOT LIKE '<%' ORDER BY model",
    );
    return rows.map((row) => ({
      ...row,
      providers: (providersFor.all(row.id) as Array<{ provider: string }>).map((r) => r.provider),
      models: (modelsFor.all(row.id) as Array<{ model: string }>).map((r) => r.model),
    }));
  }

  search(query: string, limit = 50): SearchHit[] {
    const match = query
      .split(/\s+/)
      .filter((term) => term.length > 0)
      .map((term) => `"${term.replaceAll('"', '""')}"`)
      .join(" ");
    if (match === "") return [];
    const rows = this.#db
      .prepare(
        `SELECT f.event_id AS id, snippet(events_fts, 0, '[', ']', '…', 8) AS snip
         FROM events_fts f WHERE events_fts MATCH ? LIMIT ?`,
      )
      .all(match, limit) as Array<{ id: string; snip: string }>;
    const byId = this.#db.prepare("SELECT json FROM events WHERE id = ?");
    return rows.flatMap((row) => {
      const found = byId.get(row.id) as { json: string } | undefined;
      return found === undefined
        ? []
        : [{ event: JSON.parse(found.json) as ChronicleEvent, snippet: row.snip }];
    });
  }

  commitLinks(sha: string): CorrelatedLink[] {
    return (
      this.#db
        .prepare(
          "SELECT commit_sha, session, confidence, source FROM links WHERE commit_sha = ? AND confidence != 'rejected'",
        )
        .all(sha.slice(0, 7)) as Array<{ commit_sha: string; session: string; confidence: string; source: string }>
    ).map((row) => ({
      commit: row.commit_sha,
      session: row.session,
      confidence: row.confidence as CorrelatedLink["confidence"],
      source: row.source,
    }));
  }

  /** Links for one session (the reverse lookup surfaces use). */
  sessionLinks(session: string): CorrelatedLink[] {
    return (
      this.#db
        .prepare(
          "SELECT commit_sha, session, confidence, source FROM links WHERE session = ? AND confidence != 'rejected'",
        )
        .all(session) as Array<{ commit_sha: string; session: string; confidence: string; source: string }>
    ).map((row) => ({
      commit: row.commit_sha,
      session: row.session,
      confidence: row.confidence as CorrelatedLink["confidence"],
      source: row.source,
    }));
  }

  /** Full refresh of the derived links projection (§11 — links never live in the log). */
  replaceLinks(
    links: ReadonlyArray<{ commit: string; session: string; confidence: string; source: string }>,
  ): void {
    const refresh = this.#db.transaction(() => {
      this.#db.prepare("DELETE FROM links").run();
      const insert = this.#db.prepare(
        "INSERT INTO links (commit_sha, session, confidence, source) VALUES (?, ?, ?, ?)",
      );
      for (const link of links) insert.run(link.commit, link.session, link.confidence, link.source);
    });
    refresh();
  }

  /** Full ordered dump of derived rows — the rebuild≡incremental test surface. */
  dump(): Record<string, unknown[]> {
    const q = (sql: string): unknown[] => this.#db.prepare(sql).all();
    return {
      events: q("SELECT * FROM events ORDER BY id"),
      sessions: q("SELECT * FROM sessions ORDER BY id"),
      files_touched: q("SELECT * FROM files_touched ORDER BY event_id, path"),
      links: q("SELECT * FROM links ORDER BY commit_sha, session"),
      events_fts: q("SELECT event_id, text FROM events_fts ORDER BY event_id"),
    };
  }

  close(): void {
    this.#db.close();
  }

  // ---------------------------------------------------------------- private

  #indexEvent(event: ChronicleEvent, file: string): void {
    this.#db
      .prepare(
        `INSERT OR IGNORE INTO events (id, ts, type, session, provider, model, branch, head, visibility, file, json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.id,
        event.ts,
        event.type,
        event.session ?? null,
        stripProviderVersion(event.meta.provider),
        event.actor.model ?? null,
        event.git.branch,
        event.git.head,
        event.meta.visibility,
        file,
        JSON.stringify(event),
      );

    // A session exists because events belong to it — not because a lifecycle
    // event announced it. If a SessionStart hook is missed or a provider
    // never emits one, the prompts are still captured and still replayable;
    // hiding the session would be a silent lie about what we hold, and the
    // extension (which derives sessions from any event carrying a session id)
    // would disagree with us about what exists. Lifecycle events below enrich
    // this row; they no longer gate its existence.
    if (event.session !== undefined) {
      this.#db.prepare("INSERT OR IGNORE INTO sessions (id) VALUES (?)").run(event.session);
    }

    if (event.type === "SessionStarted" && event.session !== undefined) {
      const payload = event.payload as { title: string | null };
      this.#db
        .prepare(
          `INSERT OR REPLACE INTO sessions (id, started, ended, provider, model, title)
           VALUES (?, ?, (SELECT ended FROM sessions WHERE id = ?), ?, ?, ?)`,
        )
        .run(
          event.session,
          event.ts,
          event.session,
          event.actor.provider ?? event.meta.provider,
          event.actor.model ?? null,
          payload.title,
        );
    } else if (event.type === "SessionEnded" && event.session !== undefined) {
      this.#db
        .prepare(
          `INSERT INTO sessions (id, ended) VALUES (?, ?)
           ON CONFLICT(id) DO UPDATE SET ended = excluded.ended`,
        )
        .run(event.session, event.ts);
    }

    if (["FileModified", "FilesAccepted", "FilesRejected"].includes(event.type)) {
      const paths = (event.payload as { paths: string[] }).paths;
      const insert = this.#db.prepare("INSERT INTO files_touched (event_id, path) VALUES (?, ?)");
      for (const touched of paths) insert.run(event.id, touched);
    }

    const text = extractSearchText(event);
    if (text !== null) {
      this.#db.prepare("INSERT INTO events_fts (text, event_id) VALUES (?, ?)").run(text, event.id);
    }
  }
}

/** "claude-code@1.0.0" → "claude-code" — the id users filter by. */
function stripProviderVersion(providerRef: string): string {
  const at = providerRef.lastIndexOf("@");
  return at <= 0 ? providerRef : providerRef.slice(0, at);
}

/** Schema version of an existing file; null when it has none (fresh file). */
function safeReadVersion(db: BetterSqlite3.Database): number | null {
  try {
    const value = readMeta(db, "index_schema_version");
    return value === null ? null : Number(value);
  } catch {
    return null; // no meta table — fresh or pre-meta file; DDL will create it
  }
}

function readMeta(db: BetterSqlite3.Database, key: string): string | null {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

function writeMeta(db: BetterSqlite3.Database, key: string, value: string): void {
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run(key, value);
}
