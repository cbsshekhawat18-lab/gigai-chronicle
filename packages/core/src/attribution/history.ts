/**
 * Session git activity — the real commits, and the code files they changed,
 * within a session's active time window, read straight from git history.
 *
 * This is what the dashboard's **Commits** and **Files** tabs show. It is
 * DISTINCT from ADR-0013 checkpoint attribution (`changesByPrompt`): that
 * answers "which prompt shaped this file" from shadow checkpoints; this answers
 * "what did this session commit" from the real history, scoped by time — so the
 * dashboard can surface commits and files without a provider having to emit
 * synthetic `GitCommitCreated`/`FileModified` events (which none do today).
 *
 * Honest scope: attribution is by the session's time WINDOW, so a commit made
 * during the session but for unrelated work can appear. It is real git data,
 * never fabricated, and the UI labels it "during this session".
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

async function gitLog(repoRoot: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["-C", repoRoot, ...args], {
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 32 * 1024 * 1024,
    });
    return stdout;
  } catch {
    return null; // no git / bad range — say nothing, never guess
  }
}

/** One real commit in the session window. `sha` is short (display), `ts` UTC. */
export interface SessionCommit {
  sha: string;
  subject: string;
  ts: string;
}

/** One distinct file changed by the window's commits. */
export interface SessionFile {
  path: string;
  status: string;
  ts: string;
}

export interface SessionGitActivity {
  commits: SessionCommit[];
  files: SessionFile[];
}

export interface SessionGitActivityOptions {
  maxCommits?: number;
  maxFiles?: number;
}

const REC = "\x01"; // commit-record start marker (won't occur in a subject)
const SEP = "\x1f"; // field separator (unit separator)

/** git name-status code → a plain word (the code's first letter carries it). */
function statusWord(code: string): string {
  switch (code[0]) {
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    case "T":
      return "type-changed";
    default:
      return "modified";
  }
}

/** Any git ISO date → the store's UTC `…Z` form, so it sorts lexicographically
 *  alongside event timestamps. Unparseable input passes through untouched. */
function toUtc(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? iso : new Date(t).toISOString();
}

/**
 * Parse `git log --name-status` (with our REC/SEP pretty format) into commits
 * and DISTINCT files. Pure and exported for testing. Input is newest-first
 * (git's default), so the first time a file is seen is its most recent touch.
 * The store's own `.chronicle/` is excluded — the Files tab shows code, not the
 * journal.
 */
export function parseSessionGitLog(
  out: string,
  options: SessionGitActivityOptions = {},
): SessionGitActivity {
  const maxCommits = options.maxCommits ?? 500;
  const maxFiles = options.maxFiles ?? 1000;
  const commits: SessionCommit[] = [];
  const files: SessionFile[] = [];
  const seenFile = new Set<string>();
  let currentTs = "";
  for (const raw of out.split("\n")) {
    if (raw.startsWith(REC)) {
      const [sha, cISO, subject] = raw.slice(REC.length).split(SEP);
      if (sha === undefined || cISO === undefined) continue;
      currentTs = toUtc(cISO);
      if (commits.length < maxCommits) {
        commits.push({ sha: sha.slice(0, 9), subject: subject ?? "", ts: currentTs });
      }
      continue;
    }
    if (raw === "" || currentTs === "") continue;
    const parts = raw.split("\t");
    if (parts.length < 2) continue;
    // Rename/copy is "R100\told\tnew" — the destination path is always last.
    const path = parts[parts.length - 1] as string;
    if (path === "" || path.startsWith(".chronicle/")) continue;
    if (seenFile.has(path)) continue;
    seenFile.add(path);
    if (files.length < maxFiles) {
      files.push({ path, status: statusWord(parts[0] as string), ts: currentTs });
    }
  }
  return { commits, files };
}

/**
 * Real commits — and the code files they touched — in `[since, until]`
 * (committer date). `until === null` means "up to now" (an open session);
 * `since === null` returns nothing (no window, no guessing).
 */
export async function sessionGitActivity(
  repoRoot: string,
  since: string | null,
  until: string | null,
  options: SessionGitActivityOptions = {},
): Promise<SessionGitActivity> {
  if (since === null) return { commits: [], files: [] };
  const out = await gitLog(repoRoot, [
    "log",
    `--since=${since}`,
    ...(until !== null ? [`--until=${until}`] : []),
    "--date=iso-strict",
    "--name-status",
    `--pretty=format:${REC}%H${SEP}%cI${SEP}%s`,
  ]);
  if (out === null) return { commits: [], files: [] };
  return parseSessionGitLog(out, options);
}
