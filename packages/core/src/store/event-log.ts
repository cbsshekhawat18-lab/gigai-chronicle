/**
 * The EventLog — Chronicle Store layer 1 (ARCHITECTURE.md §8).
 *
 * Exactly three log operations, forever: `append(events)`, `scan(range)`,
 * `verify()`. Later phases may add packages and event types — they may not
 * add operations here. (open/flush/close are lifecycle, not log operations.)
 *
 * Guarantees:
 *  - append is O(1): one buffered write per event to a cached handle;
 *    fsync on close and on a periodic timer, never on the hot path.
 *  - a crash mid-write leaves at most one torn trailing line per stream;
 *    `verify()` truncates it and records the loss as a CaptureGap event —
 *    the log is never rewritten in place beyond that truncation (§18).
 *  - streams are single-writer by construction (paths.ts, ADR-0007) across
 *    machines, and by advisory locks (locks.ts) within one machine.
 */
import { mkdir, open as openFile, readdir, readFile, stat, truncate } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";
import {
  newId,
  parseChronicleEvent,
  parseChronicleEventLine,
  type ChronicleEvent,
  type SessionId,
  type WorkspaceId,
} from "@gigaichronicle/schema";
import { ChronicleError } from "../errors.js";
import { absoluteStreamPath, blobDirFor, lockNameFor, locksDir, streamForEvent } from "./paths.js";
import { acquireLock, releaseLock } from "./locks.js";
import { spillOversizedFields } from "./blobs.js";

/** Provider identity stamped on store-authored events (verify gaps). */
const STORE_PROVIDER = "chronicle-core@0";

const DEFAULT_FSYNC_INTERVAL_MS = 5_000;

export interface EventLogOptions {
  /** Workspace recording on this machine — stamped on store-authored events. */
  workspaceId: WorkspaceId;
  /** Periodic fsync interval; 0 disables the timer (tests). */
  fsyncIntervalMs?: number;
}

export interface ScanRange {
  /** Inclusive canonical-form timestamp lower bound. */
  from?: string;
  /** Inclusive canonical-form timestamp upper bound. */
  to?: string;
  session?: SessionId;
  /** Which stream visibilities to read. Default: "shared". */
  visibility?: "shared" | "local" | "all";
}

export interface ScannedEvent {
  event: ChronicleEvent;
  /** Stream file, relative to the chronicle root, POSIX separators. */
  file: string;
}

export interface VerifyReport {
  scannedFiles: number;
  /** Streams whose torn trailing line was truncated (loss recorded as CaptureGap). */
  healed: Array<{ file: string; truncatedBytes: number; gapEvent: string }>;
  /** Non-tail lines that failed to parse — reported, never rewritten (§18). */
  problems: Array<{ file: string; line: number; code: string; message: string }>;
}

interface OpenStream {
  handle: FileHandle;
  lockFile: string;
}

export class EventLog {
  readonly #dir: string;
  readonly #options: Required<EventLogOptions>;
  readonly #streams = new Map<string, OpenStream>(); // relativeFile → open state
  #fsyncTimer: NodeJS.Timeout | undefined;
  #closed = false;

  private constructor(dir: string, options: Required<EventLogOptions>) {
    this.#dir = dir;
    this.#options = options;
    if (options.fsyncIntervalMs > 0) {
      this.#fsyncTimer = setInterval(() => {
        void this.flush().catch(() => undefined);
      }, options.fsyncIntervalMs);
      this.#fsyncTimer.unref();
    }
  }

  /** Open the log rooted at an existing `.chronicle` directory. */
  static async open(chronicleDir: string, options: EventLogOptions): Promise<EventLog> {
    const dirStat = await stat(chronicleDir).catch(() => null);
    if (dirStat === null || !dirStat.isDirectory()) {
      throw new ChronicleError("E_NOT_INITIALIZED", `not a chronicle store: ${chronicleDir}`);
    }
    return new EventLog(chronicleDir, {
      workspaceId: options.workspaceId,
      fsyncIntervalMs: options.fsyncIntervalMs ?? DEFAULT_FSYNC_INTERVAL_MS,
    });
  }

  /** Append events, each to its one stream. Validates before writing. */
  async append(events: readonly ChronicleEvent[]): Promise<void> {
    this.#assertOpen();
    for (const candidate of events) {
      const verdict = parseChronicleEvent(candidate);
      if (!verdict.ok) {
        throw new ChronicleError(
          "E_INVALID_EVENT",
          `refusing to append invalid event: ${verdict.code} — ${verdict.message}`,
        );
      }
      const ref = streamForEvent(candidate);
      const file = absoluteStreamPath(this.#dir, ref);
      const { event } = await spillOversizedFields(candidate, blobDirFor(file));
      const stream = await this.#openStream(ref.relativeFile, file, lockNameFor(ref));
      await stream.handle.write(JSON.stringify(event) + "\n", null, "utf8");
    }
  }

  /** Read events back, in file order per stream, streams in path order. */
  async *scan(range: ScanRange = {}): AsyncGenerator<ScannedEvent> {
    this.#assertOpen();
    const visibility = range.visibility ?? "shared";
    for (const relativeFile of await this.#listStreamFiles(visibility)) {
      if (range.session !== undefined && !relativeFile.endsWith(`/${range.session}.jsonl`)) {
        continue;
      }
      const content = await readFile(path.join(this.#dir, ...relativeFile.split("/")), "utf8");
      for (const line of completeLines(content)) {
        const verdict = parseChronicleEventLine(line);
        if (!verdict.ok) continue; // diagnosis is verify()'s job
        const event = verdict.event;
        if (range.from !== undefined && event.ts < range.from) continue;
        if (range.to !== undefined && event.ts > range.to) continue;
        yield { event, file: relativeFile };
      }
    }
  }

  /**
   * Check every stream: truncate a torn trailing line (recording the loss as
   * a CaptureGap on the same stream) and report — without rewriting — any
   * other unparseable lines.
   */
  async verify(): Promise<VerifyReport> {
    this.#assertOpen();
    const report: VerifyReport = { scannedFiles: 0, healed: [], problems: [] };

    for (const relativeFile of await this.#listStreamFiles("all")) {
      report.scannedFiles += 1;
      const file = path.join(this.#dir, ...relativeFile.split("/"));
      const content = await readFile(file, "utf8");

      const torn = tornTail(content);
      if (torn !== null) {
        // Truncation must not race the writer's cached handle.
        await this.#closeStream(relativeFile);
        await truncate(file, Buffer.byteLength(content.slice(0, torn.goodLength), "utf8"));
        const gap = this.#makeGapEvent(relativeFile, torn.lostBytes);
        await this.append([gap]);
        report.healed.push({
          file: relativeFile,
          truncatedBytes: torn.lostBytes,
          gapEvent: gap.id,
        });
      }

      const lines = completeLines(content.slice(0, torn === null ? undefined : torn.goodLength));
      lines.forEach((line, index) => {
        const verdict = parseChronicleEventLine(line);
        if (!verdict.ok) {
          report.problems.push({
            file: relativeFile,
            line: index + 1,
            code: verdict.code,
            message: verdict.message,
          });
        }
      });
    }
    return report;
  }

  /** fsync all open stream handles. */
  async flush(): Promise<void> {
    for (const stream of this.#streams.values()) {
      await stream.handle.sync().catch(() => undefined);
    }
  }

  /** Flush, close handles, release locks. Idempotent. */
  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    if (this.#fsyncTimer !== undefined) clearInterval(this.#fsyncTimer);
    await this.flush();
    for (const relativeFile of [...this.#streams.keys()]) {
      await this.#closeStream(relativeFile);
    }
  }

  // ---------------------------------------------------------------- private

  #assertOpen(): void {
    if (this.#closed) throw new ChronicleError("E_NOT_INITIALIZED", "event log is closed");
  }

  async #openStream(relativeFile: string, file: string, lockName: string): Promise<OpenStream> {
    const existing = this.#streams.get(relativeFile);
    if (existing !== undefined) return existing;
    const lockFile = await acquireLock(locksDir(this.#dir), lockName);
    try {
      await mkdir(path.dirname(file), { recursive: true });
      const handle = await openFile(file, "a");
      const stream: OpenStream = { handle, lockFile };
      this.#streams.set(relativeFile, stream);
      return stream;
    } catch (error) {
      await releaseLock(lockFile);
      throw error;
    }
  }

  async #closeStream(relativeFile: string): Promise<void> {
    const stream = this.#streams.get(relativeFile);
    if (stream === undefined) return;
    this.#streams.delete(relativeFile);
    await stream.handle.close().catch(() => undefined);
    await releaseLock(stream.lockFile);
  }

  async #listStreamFiles(visibility: "shared" | "local" | "all"): Promise<string[]> {
    const roots: string[] = [];
    if (visibility !== "local") roots.push("sessions");
    if (visibility !== "shared") roots.push(".local/ops");
    const files: string[] = [];
    for (const root of roots) {
      const rootDir = path.join(this.#dir, ...root.split("/"));
      for (const entry of await readdir(rootDir, { recursive: true, withFileTypes: true }).catch(
        () => [],
      )) {
        if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
        const absolute = path.join(entry.parentPath, entry.name);
        files.push(path.relative(this.#dir, absolute).split(path.sep).join("/"));
      }
    }
    return files.sort();
  }

  #makeGapEvent(relativeFile: string, lostBytes: number): ChronicleEvent {
    const sessionMatch = /\/(ses_[0-9A-HJKMNP-TV-Z]{26})\.jsonl$/.exec(relativeFile);
    const isOps = relativeFile.startsWith(".local/ops/");
    const event = {
      v: 1,
      id: newId("event"),
      ts: new Date().toISOString().replace(/(\.\d{3})\d*Z$/, "$1Z"),
      type: "CaptureGap",
      ...(sessionMatch !== null ? { session: sessionMatch[1] } : {}),
      actor: { kind: "system" },
      git: { head: null, branch: null, dirty: [] },
      payload: {
        reason: "torn-write",
        detail: `${relativeFile}: truncated ${lostBytes} bytes (torn trailing line)`,
      },
      meta: {
        provider: STORE_PROVIDER,
        workspace: this.#options.workspaceId,
        schema: "CaptureGap/1",
        visibility: isOps ? "local" : "shared",
      },
    };
    return event as unknown as ChronicleEvent;
  }
}

/** Complete (newline-terminated) lines of a stream file, empty lines skipped. */
function completeLines(content: string): string[] {
  const lastNewline = content.lastIndexOf("\n");
  if (lastNewline === -1) return [];
  return content
    .slice(0, lastNewline)
    .split("\n")
    .filter((line) => line.trim() !== "");
}

/**
 * Detect a torn tail: bytes after the last newline (or the whole file when
 * no newline exists). Returns null for a cleanly terminated file.
 */
function tornTail(content: string): { goodLength: number; lostBytes: number } | null {
  if (content === "" || content.endsWith("\n")) return null;
  const lastNewline = content.lastIndexOf("\n");
  const goodLength = lastNewline + 1; // 0 when no newline at all
  return { goodLength, lostBytes: Buffer.byteLength(content.slice(goodLength), "utf8") };
}
