/**
 * Correlation link scoring — §11. Links are DERIVED index edges, recomputed
 * from truth; never invented into the log. Signals in strength order:
 *
 *   exact    Chronicle-Session trailer in the commit message
 *   high     commit files ∩ session's touched files, inside the session window
 *   inferred commit time inside the session window
 *
 * Human overrides (`LinkConfirmed`/`LinkRejected` events) beat heuristics
 * permanently: confirmed → exact/human; rejected → suppressed forever.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { EventLog } from "../store/event-log.js";
import type { ChronicleIndex } from "../index-db/chronicle-index.js";

const exec = promisify(execFile);

/** Post-session slack: commits shortly after a session still correlate. */
const WINDOW_SLACK_MS = 30 * 60 * 1000;

interface SessionWindow {
  session: string;
  startMs: number;
  endMs: number;
  touched: Set<string>;
}

interface CommitInfo {
  sha: string;
  shortSha: string;
  committedMs: number;
  trailerSessions: string[];
  files: string[];
}

async function git(repoRoot: string, ...args: string[]): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["-C", repoRoot, ...args], {
      encoding: "utf8",
      timeout: 10_000,
      maxBuffer: 32 * 1024 * 1024,
    });
    return stdout;
  } catch {
    return null;
  }
}

/** Recent commit history with trailers and file lists (bounded). */
async function readCommits(repoRoot: string, limit: number): Promise<CommitInfo[]> {
  const raw = await git(
    repoRoot,
    "log",
    `-${limit}`,
    "--name-only",
    "--format=%x01%H%x00%ct%x00%(trailers:key=Chronicle-Session,valueonly)",
  );
  if (raw === null) return [];
  const commits: CommitInfo[] = [];
  for (const chunk of raw.split("\x01")) {
    if (chunk.trim() === "") continue;
    const [header, ...fileLines] = chunk.split("\n");
    const [sha, epoch, trailers] = (header as string).split("\x00");
    if (sha === undefined || epoch === undefined) continue;
    commits.push({
      sha,
      shortSha: sha.slice(0, 7),
      committedMs: Number(epoch) * 1000,
      trailerSessions: (trailers ?? "")
        .split("\n")
        .map((t) => t.trim())
        .filter((t) => t.startsWith("ses_")),
      files: fileLines.map((f) => f.trim()).filter((f) => f !== ""),
    });
  }
  return commits;
}

/** Session windows + touched-file sets from the shared record. */
async function sessionWindows(log: EventLog): Promise<SessionWindow[]> {
  const bySession = new Map<string, SessionWindow>();
  for await (const { event } of log.scan()) {
    if (event.session === undefined) continue;
    const ms = Date.parse(event.ts);
    let window = bySession.get(event.session);
    if (window === undefined) {
      window = { session: event.session, startMs: ms, endMs: ms, touched: new Set() };
      bySession.set(event.session, window);
    }
    window.startMs = Math.min(window.startMs, ms);
    window.endMs = Math.max(window.endMs, ms);
    if (["FileModified", "FilesAccepted", "FilesRejected"].includes(event.type)) {
      for (const p of (event.payload as { paths: string[] }).paths) window.touched.add(p);
    }
    for (const dirty of event.git.dirty) window.touched.add(dirty);
  }
  return [...bySession.values()];
}

export interface LinkRow {
  commit: string;
  session: string;
  confidence: "exact" | "high" | "inferred" | "rejected";
  source: "trailer" | "dirty-set" | "time-window" | "human";
}

export interface CorrelationReport {
  commitsScanned: number;
  links: LinkRow[];
}

/**
 * Recompute all derived links and apply human overrides. Writes the result
 * into the index's `links` table (full refresh — links are a projection).
 */
export async function recomputeLinks(
  repoRoot: string,
  log: EventLog,
  index: ChronicleIndex,
  options: { commitLimit?: number } = {},
): Promise<CorrelationReport> {
  const commits = await readCommits(repoRoot, options.commitLimit ?? 500);
  const windows = await sessionWindows(log);

  // Human overrides from the shared record.
  const confirmed = new Set<string>();
  const rejected = new Set<string>();
  for await (const { event } of log.scan()) {
    if (event.type !== "LinkConfirmed" && event.type !== "LinkRejected") continue;
    const payload = event.payload as { commit: string; session: string };
    const key = `${payload.commit}\x00${payload.session}`;
    if (event.type === "LinkConfirmed") {
      confirmed.add(key);
      rejected.delete(key);
    } else {
      rejected.add(key);
      confirmed.delete(key);
    }
  }

  const best = new Map<string, LinkRow>();
  const consider = (row: LinkRow): void => {
    const key = `${row.commit}\x00${row.session}`;
    if (rejected.has(key)) return; // severed forever
    const rank = { exact: 3, high: 2, inferred: 1, rejected: 0 } as const;
    const existing = best.get(key);
    if (existing === undefined || rank[row.confidence] > rank[existing.confidence]) {
      best.set(key, row);
    }
  };

  for (const commit of commits) {
    for (const session of commit.trailerSessions) {
      consider({ commit: commit.shortSha, session, confidence: "exact", source: "trailer" });
    }
    for (const window of windows) {
      // Git commit timestamps are SECOND-precision; compare at that
      // granularity or a commit in the session's first second falls
      // spuriously outside the window.
      const commitSec = Math.floor(commit.committedMs / 1000);
      const inWindow =
        commitSec >= Math.floor(window.startMs / 1000) &&
        commitSec <= Math.floor((window.endMs + WINDOW_SLACK_MS) / 1000);
      if (!inWindow) continue;
      const overlaps = commit.files.some((file) => window.touched.has(file));
      consider(
        overlaps
          ? { commit: commit.shortSha, session: window.session, confidence: "high", source: "dirty-set" }
          : { commit: commit.shortSha, session: window.session, confidence: "inferred", source: "time-window" },
      );
    }
  }
  for (const key of confirmed) {
    const [commit, session] = key.split("\x00") as [string, string];
    best.set(key, { commit: commit.slice(0, 7), session, confidence: "exact", source: "human" });
  }

  const links = [...best.values()].sort(
    (a, b) => a.commit.localeCompare(b.commit) || a.session.localeCompare(b.session),
  );
  index.replaceLinks(links);
  return { commitsScanned: commits.length, links };
}
