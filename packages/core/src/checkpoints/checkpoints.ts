/**
 * Git-native shadow checkpoints (ADR-0012): snapshot the working tree into
 * `refs/chronicle/ckpt/<evt_id>` without touching HEAD, the index, any
 * branch, or the working tree — a temp index does the staging. Restore is
 * explicit, safety-checkpointed, and honest about what it cannot restore.
 */
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { ChronicleError } from "../errors.js";

const exec = promisify(execFile);

const CKPT_NS = "refs/chronicle/ckpt";
const SAFETY_NS = "refs/chronicle/safety";

/**
 * Pathspec excluding Chronicle's own store: a code checkpoint snapshots and
 * restores CODE, never `.chronicle/` — reverting the append-only journal
 * would rewrite history (design law 2). The journey stays intact across any
 * restore.
 */
const CODE_ONLY = [".", ":(exclude).chronicle", ":(exclude).chronicle/**"];

async function git(
  repoRoot: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["-C", repoRoot, ...args], {
      encoding: "utf8",
      timeout: 30_000,
      env: { ...process.env, ...env },
    });
    return stdout;
  } catch {
    return null;
  }
}

/**
 * Snapshot the working tree under `refName`. Returns the commit sha, or
 * null on any failure (checkpointing must never block capture — law 8).
 */
async function snapshot(repoRoot: string, ref: string, label: string): Promise<string | null> {
  const scratch = await mkdtemp(path.join(tmpdir(), "chronicle-ckpt-"));
  const indexFile = path.join(scratch, "index");
  try {
    const env = { GIT_INDEX_FILE: indexFile };
    // Stage EVERYTHING (tracked + untracked, .gitignore respected) into the
    // temp index — the real index and worktree are untouched.
    if ((await git(repoRoot, ["add", "-A", "--", ...CODE_ONLY], env)) === null) return null;
    const tree = (await git(repoRoot, ["write-tree"], env))?.trim();
    if (tree === undefined) return null;

    const head = (await git(repoRoot, ["rev-parse", "HEAD"]))?.trim() ?? null;
    const headTree = head === null ? null : (await git(repoRoot, ["rev-parse", "HEAD^{tree}"]))?.trim();

    let commit: string;
    if (head !== null && tree === headTree) {
      commit = head; // clean tree — the checkpoint IS the current commit
    } else {
      // Carry our own identity — `commit-tree` needs one, and a checkpoint
      // must work even where the user has no global git identity (CI, fresh
      // machines). Never depends on, nor touches, the user's git config.
      const identity = {
        GIT_AUTHOR_NAME: "chronicle",
        GIT_AUTHOR_EMAIL: "checkpoint@chronicle.local",
        GIT_COMMITTER_NAME: "chronicle",
        GIT_COMMITTER_EMAIL: "checkpoint@chronicle.local",
      };
      const args = ["commit-tree", tree, "-m", `chronicle checkpoint ${label}`];
      if (head !== null) args.push("-p", head);
      const created = (await git(repoRoot, args, identity))?.trim();
      if (created === undefined) return null;
      commit = created;
    }
    if ((await git(repoRoot, ["update-ref", ref, commit])) === null) return null;
    return commit;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

/** Checkpoint the working tree for a captured event. Null = quietly skipped. */
export async function createCheckpoint(repoRoot: string, eventId: string): Promise<string | null> {
  return snapshot(repoRoot, `${CKPT_NS}/${eventId}`, eventId);
}

/** The checkpoint commit for an event, if one was taken. */
export async function checkpointFor(repoRoot: string, eventId: string): Promise<string | null> {
  const sha = await git(repoRoot, ["rev-parse", "-q", "--verify", `${CKPT_NS}/${eventId}`]);
  return sha?.trim() ?? null;
}

/** Event ids that have checkpoints (one batch call for UI decoration). */
export async function listCheckpointedEvents(repoRoot: string): Promise<Set<string>> {
  const out = await git(repoRoot, ["for-each-ref", "--format=%(refname:short)", CKPT_NS]);
  const ids = new Set<string>();
  if (out === null) return ids;
  for (const line of out.split("\n")) {
    const id = line.trim().split("/").pop();
    if (id !== undefined && id.startsWith("evt_")) ids.add(id);
  }
  return ids;
}

export interface RestoreResult {
  checkpoint: string;
  /** Safety snapshot of the pre-restore state — nothing is ever lost. */
  safetyCheckpoint: string;
  /** Files the restore changed. */
  restored: string[];
  /** Files that did not exist at the checkpoint — left in place (honest v1 limit). */
  untouchedNewFiles: string[];
}

/** Files that would change if restoring to `sha` (worktree vs checkpoint). */
export async function restorePreview(repoRoot: string, eventId: string): Promise<string[]> {
  const sha = await checkpointFor(repoRoot, eventId);
  if (sha === null) return [];
  const out = await git(repoRoot, ["diff", "--name-only", sha, "--", ...CODE_ONLY]);
  return (out ?? "").split("\n").map((l) => l.trim()).filter((l) => l !== "");
}

/**
 * Restore the working tree to an event's checkpoint (ADR-0012 semantics).
 * Caller is responsible for user confirmation.
 */
export async function restoreCheckpoint(repoRoot: string, eventId: string): Promise<RestoreResult> {
  const checkpoint = await checkpointFor(repoRoot, eventId);
  if (checkpoint === null) {
    throw new ChronicleError("E_NOT_INITIALIZED", `no checkpoint recorded for ${eventId}`);
  }

  const safety = await snapshot(repoRoot, `${SAFETY_NS}/${Date.now()}`, `pre-restore ${eventId}`);
  if (safety === null) {
    throw new ChronicleError("E_LOCKED", "could not take the safety checkpoint — restore aborted");
  }

  const inCheckpoint = new Set(
    ((await git(repoRoot, ["ls-tree", "-r", "--name-only", checkpoint])) ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l !== "" && !l.startsWith(".chronicle/")),
  );
  // Restorable = tracked files that differ from the checkpoint.
  const restorable = (await restorePreview(repoRoot, eventId)).filter((f) => inCheckpoint.has(f));
  // Untouched = files present NOW but absent at the checkpoint. `git restore
  // --source` cannot remove them; surfaced honestly. Untracked new files are
  // invisible to `git diff`, so `ls-files` supplies both sets.
  const now = new Set<string>();
  for (const flag of [["ls-files"], ["ls-files", "--others", "--exclude-standard"]]) {
    for (const line of ((await git(repoRoot, [...flag, "--", ...CODE_ONLY])) ?? "").split("\n")) {
      const file = line.trim();
      if (file !== "") now.add(file);
    }
  }
  const untouchedNewFiles = [...now].filter((f) => !inCheckpoint.has(f)).sort();

  if (restorable.length > 0) {
    const result = await git(repoRoot, ["restore", "--source", checkpoint, "--worktree", "--", ...CODE_ONLY]);
    if (result === null) {
      throw new ChronicleError("E_LOCKED", `git restore failed (safety checkpoint kept: ${safety})`);
    }
  }
  return { checkpoint, safetyCheckpoint: safety, restored: restorable, untouchedNewFiles };
}
