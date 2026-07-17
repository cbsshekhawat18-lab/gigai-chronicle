/**
 * Intent attribution (ADR-0013) — the question `git blame` cannot answer:
 * not *who* changed this file, but *what was asked* that changed it.
 *
 * Derived, never stored. Capture already takes a shadow checkpoint at every
 * captured prompt (ADR-0012), so the tree at checkpoint N is the state the
 * Nth turn STARTED from. That single fact is the whole engine:
 *
 *   ckpt(P1) ──turn of P1──▶ ckpt(P2) ──turn of P2──▶ ckpt(P3) ──turn of P3──▶ worktree
 *
 * The diff between two consecutive checkpoints is therefore the work of the
 * EARLIER prompt's turn, and the newest checkpoint diffs against the working
 * tree because that turn is still open. No new events, no schema change, no
 * line tracking, nothing to keep in sync — the answer is recomputed on
 * demand and so can never go stale or disagree with the checkpoints.
 *
 * Honest limits (surfaced, never hidden — §Consequences of ADR-0013):
 * - A turn's diff is everything that changed while the turn was open,
 *   including edits typed by the human alongside the agent. It answers
 *   "what happened during this prompt", not "what the model wrote".
 * - Renames are not followed across turns; a path is a path.
 * - Only work done while capture was running is attributable; a file older
 *   than the first checkpoint has no answer here, and says so.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { listCheckpoints, worktreeTree } from "../checkpoints/checkpoints.js";

const exec = promisify(execFile);

/**
 * Chronicle's own store is not code. Checkpoint trees already exclude
 * `.chronicle/` (ADR-0012), but a clean-tree checkpoint aliases to HEAD,
 * whose tree may track it — excluding it on both sides keeps a mixed pair
 * from reporting the whole journal as deleted.
 */
const NOT_THE_STORE = ":(exclude).chronicle";

/** Default number of attributed turns returned — the recent history that fits on screen. */
const DEFAULT_LIMIT = 10;

async function git(repoRoot: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["-C", repoRoot, ...args], {
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 32 * 1024 * 1024,
    });
    return stdout;
  } catch {
    return null;
  }
}

/** One file's churn within a single turn. Null counts mean a binary file. */
export interface FileChange {
  path: string;
  insertions: number | null;
  deletions: number | null;
}

/** The code changes one captured prompt's turn produced. */
export interface PromptChange {
  /** The prompt event whose turn did this work. */
  eventId: string;
  /** Checkpoint the turn started from. */
  from: string;
  /** Checkpoint the turn ended at; null = the live working tree (turn still open). */
  to: string | null;
  files: FileChange[];
}

export interface ChangesByPromptOptions {
  /** Narrow to one repo-relative path — the `chronicle why <file>` question. */
  path?: string;
  /** Stop after this many attributed turns (newest-first scan). */
  limit?: number;
}

/** `git diff --numstat` → structured churn. Binary files report `-` counts. */
export function parseNumstat(out: string): FileChange[] {
  const files: FileChange[] = [];
  for (const line of out.split("\n")) {
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const [added, removed, path] = parts as [string, string, string];
    if (path === "") continue;
    files.push({
      path,
      insertions: added === "-" ? null : Number(added),
      deletions: removed === "-" ? null : Number(removed),
    });
  }
  return files;
}

/**
 * What each captured prompt's turn changed, oldest first.
 *
 * Scans newest-first and stops once `limit` turns have been attributed, so
 * the common question ("what recently shaped this file?") costs a few git
 * diffs rather than one per checkpoint in history. Turns that changed
 * nothing in scope are omitted entirely — a read-only turn is not an answer.
 */
export async function changesByPrompt(
  repoRoot: string,
  options: ChangesByPromptOptions = {},
): Promise<PromptChange[]> {
  const checkpoints = await listCheckpoints(repoRoot);
  if (checkpoints.length === 0) return [];

  const limit = options.limit ?? DEFAULT_LIMIT;
  const pathspec = options.path === undefined ? [NOT_THE_STORE] : [options.path, NOT_THE_STORE];
  const changes: PromptChange[] = [];

  // The newest turn is still open, so its end state is the live tree —
  // materialized the same way a checkpoint is, so that untracked files
  // compare as content rather than as deletions.
  const openEnd = await worktreeTree(repoRoot);

  for (let i = checkpoints.length - 1; i >= 0 && changes.length < limit; i--) {
    const checkpoint = checkpoints[i] as (typeof checkpoints)[number];
    const next = checkpoints[i + 1] ?? null;
    const end = next === null ? openEnd : next.commit;
    if (end === null) continue; // worktree unreadable — say nothing, never guess
    const out = await git(repoRoot, [
      "diff",
      "--numstat",
      checkpoint.commit,
      end,
      "--",
      ...pathspec,
    ]);
    if (out === null) continue;
    const files = parseNumstat(out);
    if (files.length === 0) continue;
    changes.push({
      eventId: checkpoint.eventId,
      from: checkpoint.commit,
      to: next?.commit ?? null, // null still means "this turn is open"
      files,
    });
  }
  return changes.reverse();
}
