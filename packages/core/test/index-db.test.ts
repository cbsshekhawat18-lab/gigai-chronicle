import { rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { newId, type ChronicleEvent, type SessionId } from "@gigaichronicle/schema";
import { ChronicleIndex, EventLog } from "../src/index.js";
import {
  WORKSPACE,
  commitEvent,
  degradedEvent,
  makeTempChronicleDir,
  nextTs,
  promptEvent,
} from "./helpers/events.js";

const dirs: string[] = [];
function tempDir(): string {
  const dir = makeTempChronicleDir("chronicle-index-");
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function sessionStarted(session: SessionId, title: string): ChronicleEvent {
  return {
    v: 1,
    id: newId("event"),
    ts: nextTs(),
    type: "SessionStarted",
    session,
    actor: { kind: "human", provider: "example-tool", model: "example-model-1" },
    git: { head: "9fc1b2a", branch: "feat/auth", dirty: [] },
    payload: { title, resumedFrom: null },
    meta: {
      provider: "example-tool@1.0.0",
      workspace: WORKSPACE,
      schema: "SessionStarted/1",
      visibility: "shared",
    },
  } as ChronicleEvent;
}

function filesAccepted(session: SessionId, paths: string[]): ChronicleEvent {
  return {
    v: 1,
    id: newId("event"),
    ts: nextTs(),
    type: "FilesAccepted",
    session,
    actor: { kind: "human" },
    git: { head: "9fc1b2a", branch: "feat/auth", dirty: paths },
    payload: { paths, responseEvent: null },
    meta: {
      provider: "example-tool@1.0.0",
      workspace: WORKSPACE,
      schema: "FilesAccepted/1",
      visibility: "shared",
    },
  } as ChronicleEvent;
}

async function seed(dir: string): Promise<{ session: SessionId; events: ChronicleEvent[] }> {
  const log = await EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
  const session = newId("session");
  const events = [
    sessionStarted(session, "Auth middleware rework"),
    promptEvent(session, "Add refresh-token rotation to the auth middleware"),
    filesAccepted(session, ["src/auth/refresh.ts", "src/auth/session.ts"]),
    commitEvent(),
    degradedEvent(), // local visibility — must not appear in timeline
  ];
  await log.append(events);
  await log.close();
  return { session, events };
}

async function withIndex<T>(
  dir: string,
  fn: (index: ChronicleIndex, log: EventLog) => Promise<T>,
): Promise<T> {
  const log = await EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
  const index = ChronicleIndex.open(dir);
  try {
    return await fn(index, log);
  } finally {
    index.close();
    await log.close();
  }
}

describe("ChronicleIndex", () => {
  it("catchUp is incremental (cursor-based) and idempotent", async () => {
    const dir = tempDir();
    const { session } = await seed(dir);
    await withIndex(dir, async (index, log) => {
      expect(await index.catchUp(log)).toBe(5);
      expect(await index.catchUp(log)).toBe(0); // nothing new

      const more = await EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
      // (same process already holds locks via `log`; append through it instead)
      await more.close();
      await log.append([promptEvent(session, "second prompt")]);
      expect(await index.catchUp(log)).toBe(1);
      expect((await index.freshness(log)).fresh).toBe(true);
    });
  });

  it("timeline queries: shared-only, filters, order, limit", async () => {
    const dir = tempDir();
    const { session, events } = await seed(dir);
    await withIndex(dir, async (index, log) => {
      await index.catchUp(log);

      const all = index.timeline();
      expect(all.map((e) => e.type)).not.toContain("CaptureDegraded"); // local excluded
      expect(all).toHaveLength(4);
      expect(all.map((e) => e.ts)).toEqual([...all.map((e) => e.ts)].sort()); // ordered

      expect(index.timeline({ session })).toHaveLength(3);
      expect(index.timeline({ types: ["GitCommitCreated"] })).toHaveLength(1);
      expect(index.timeline({ branch: "main" })).toHaveLength(1); // the commit event
      const fromSecond = index.timeline({ from: events[1]?.ts as string });
      expect(fromSecond[0]?.id).toBe(events[1]?.id);
      expect(index.timeline({ limit: 2 })).toHaveLength(2);
    });
  });

  it("latest window: most recent N, returned in chronological order", async () => {
    const dir = tempDir();
    const { session } = await seed(dir);
    await withIndex(dir, async (index, log) => {
      await index.catchUp(log);
      const all = index.timeline();
      const latest2 = index.timeline({ latest: true, limit: 2 });
      expect(latest2).toHaveLength(2);
      expect(latest2).toEqual(all.slice(-2)); // the TAIL of the journey, reading order
      expect(index.timeline({ latest: true, limit: 2, session })).toEqual(
        index.timeline({ session }).slice(-2),
      );
    });
  });

  it("provider/model filters and per-session badges", async () => {
    const dir = tempDir();
    const { session } = await seed(dir);
    await withIndex(dir, async (index, log) => {
      await index.catchUp(log);
      expect(index.timeline({ provider: "example-tool" })).toHaveLength(4);
      expect(index.timeline({ provider: "nonexistent" })).toHaveLength(0);
      // seed SessionStarted carries actor.model example-model-1
      expect(index.timeline({ model: "example-model-1" })).toHaveLength(1);
      const summary = index.sessions()[0];
      expect(summary?.providers).toEqual(["example-tool"]);
      expect(summary?.models).toEqual(["example-model-1"]);
      void session;
    });
  });

  it("sessions summaries join start/end and count events", async () => {
    const dir = tempDir();
    const { session } = await seed(dir);
    await withIndex(dir, async (index, log) => {
      await index.catchUp(log);
      const summaries = index.sessions();
      expect(summaries).toHaveLength(1);
      expect(summaries[0]).toMatchObject({
        id: session,
        provider: "example-tool",
        model: "example-model-1",
        title: "Auth middleware rework",
        events: 3,
        ended: null,
      });
    });
  });

  it("FTS search finds prompt text with snippets; files_touched populated", async () => {
    const dir = tempDir();
    await seed(dir);
    await withIndex(dir, async (index, log) => {
      await index.catchUp(log);
      const hits = index.search("refresh-token rotation");
      expect(hits.length).toBeGreaterThanOrEqual(1);
      expect(hits[0]?.event.type).toBe("PromptSubmitted");
      expect(hits[0]?.snippet).toContain("[");

      const dump = index.dump();
      expect(dump["files_touched"]).toHaveLength(2);
      expect(index.search("")).toEqual([]); // degenerate query is safe
      expect(index.search('nonexistent"quoted"term')).toEqual([]); // hostile input is safe
    });
  });

  it("commitLinks exists and is empty until M9 populates it", async () => {
    const dir = tempDir();
    await seed(dir);
    await withIndex(dir, async (index, log) => {
      await index.catchUp(log);
      expect(index.commitLinks("9fc1b2a")).toEqual([]);
    });
  });

  it("DoD #1: rebuilt index ≡ incrementally built index, row-for-row", async () => {
    const dir = tempDir();
    const { session } = await seed(dir);

    // Incremental: three catch-up rounds interleaved with appends.
    const incremental = await withIndex(dir, async (index, log) => {
      await index.catchUp(log);
      await log.append([promptEvent(session, "increment two")]);
      await index.catchUp(log);
      await log.append([filesAccepted(session, ["src/more.ts"]), commitEvent()]);
      await index.catchUp(log);
      return index.dump();
    });

    // Rebuild from scratch over the same log.
    const rebuilt = await withIndex(dir, async (index, log) => {
      await index.rebuild(log);
      return index.dump();
    });

    expect(rebuilt).toEqual(incremental);
  });

  it("upgrade: a v1-shaped index file rebuilds cleanly (version check precedes DDL)", async () => {
    const dir = tempDir();
    await seed(dir);
    // Forge a v1 index: old events table WITHOUT provider/model + version 1.
    const { mkdirSync } = await import("node:fs");
    const { createRequire } = await import("node:module");
    const Database = createRequire(import.meta.url)("better-sqlite3");
    mkdirSync(`${dir}/.cache`, { recursive: true });
    const old = new Database(`${dir}/.cache/index.db`);
    old.exec(
      "CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);" +
        "CREATE TABLE events (id TEXT PRIMARY KEY, ts TEXT, type TEXT, session TEXT, branch TEXT, head TEXT, visibility TEXT, file TEXT, json TEXT);" +
        "INSERT INTO meta VALUES ('index_schema_version', '1');",
    );
    old.close();

    // Opening with the current schema must not throw — it must rebuild.
    await withIndex(dir, async (index, log) => {
      await index.catchUp(log);
      expect(index.timeline({ provider: "example-tool" })).toHaveLength(4);
      expect((await index.freshness(log)).fresh).toBe(true);
    });
  });

  it("deleting the index file is always safe (disposable cache)", async () => {
    const dir = tempDir();
    await seed(dir);
    const before = await withIndex(dir, async (index, log) => {
      await index.catchUp(log);
      return index.dump();
    });
    rmSync(`${dir}/.cache`, { recursive: true, force: true });
    const after = await withIndex(dir, async (index, log) => {
      await index.catchUp(log);
      return index.dump();
    });
    expect(after).toEqual(before);
  });
});
