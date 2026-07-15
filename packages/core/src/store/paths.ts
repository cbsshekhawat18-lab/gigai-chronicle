/**
 * Store layout — ARCHITECTURE.md §7.2 + ADR-0007.
 *
 * Every event belongs to exactly one append stream, and every stream file is
 * single-writer by construction:
 *
 *   session stream   sessions/YYYY/MM/<ses_ulid>.jsonl     (month from the
 *                    session ULID's embedded time, so one session = one file
 *                    even across a month boundary)
 *   ambient stream   sessions/YYYY/MM/amb_<wks_ulid>.jsonl (shared events
 *                    with no session; month from event ts; workspace entropy
 *                    in the name keeps it single-writer — ADR-0007)
 *   ops stream       .local/ops/YYYY/MM/ops.jsonl          (local visibility;
 *                    .local/ is machine-private, never committed)
 *
 * Blobs live next to their stream: <stream dir>/blobs/sha256-<hash>.md.
 */
import path from "node:path";
import { idTime, type ChronicleEvent, type SessionId } from "@gigaichronicle/schema";

export interface StreamRef {
  readonly kind: "session" | "ambient" | "ops";
  /** Path of the stream file, relative to the chronicle root, POSIX separators. */
  readonly relativeFile: string;
}

function monthDirFromMillis(millis: number): string {
  const date = new Date(millis);
  const year = date.getUTCFullYear().toString().padStart(4, "0");
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  return `${year}/${month}`;
}

function monthDirFromTs(ts: string): string {
  // Canonical ts form is validated by the schema; the prefix is fixed-width.
  return `${ts.slice(0, 4)}/${ts.slice(5, 7)}`;
}

/** Stream file for a session, derived from the session ULID's time. */
export function sessionStreamRef(session: SessionId): StreamRef {
  return {
    kind: "session",
    relativeFile: `sessions/${monthDirFromMillis(idTime(session))}/${session}.jsonl`,
  };
}

/** Route an event to its one append stream (ADR-0007). */
export function streamForEvent(event: ChronicleEvent): StreamRef {
  if (event.meta.visibility === "local") {
    return { kind: "ops", relativeFile: `.local/ops/${monthDirFromTs(event.ts)}/ops.jsonl` };
  }
  if (event.session !== undefined) {
    return sessionStreamRef(event.session as SessionId);
  }
  const workspace = event.meta.workspace;
  return {
    kind: "ambient",
    relativeFile: `sessions/${monthDirFromTs(event.ts)}/amb_${workspace}.jsonl`,
  };
}

/** Absolute path of a stream file. */
export function absoluteStreamPath(chronicleDir: string, ref: StreamRef): string {
  return path.join(chronicleDir, ...ref.relativeFile.split("/"));
}

/** Blob directory for a stream file (sibling `blobs/` — §7.2 rule 5). */
export function blobDirFor(streamFile: string): string {
  return path.join(path.dirname(streamFile), "blobs");
}

/** Lock file name for a stream — one advisory lock per stream file. */
export function lockNameFor(ref: StreamRef): string {
  return `${ref.relativeFile.replaceAll("/", "__")}.lock`;
}

export function locksDir(chronicleDir: string): string {
  return path.join(chronicleDir, ".local", "locks");
}
