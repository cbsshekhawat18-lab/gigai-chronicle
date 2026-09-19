/**
 * Auto-start (founder decision: every new project starts Chronicle; if it
 * can't, ask). Opening a project is the only moment where offering is
 * honest — `chronicle init` can't ask a question nobody ran it to hear, and
 * a capture hook can't prompt. Before this, a project nobody initialized
 * recorded nothing and said nothing (the silent no-capture trap).
 *
 * The DECISION is pure so it is testable without a vscode window; the ACTION
 * is exactly what `chronicle init` does — scaffold the store, then wire
 * capture — so both surfaces start a project identically.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { isGitRepository, runInit } from "@gigaichronicle/core";

/** `chronicle.autoStart` — what to do in a project that has no store yet. */
export type AutoStartMode = "auto" | "ask" | "off";

export interface AutoStartInput {
  mode: AutoStartMode;
  /** Already a chronicle project — nothing to offer. */
  initialized: boolean;
  /** Chronicle records alongside git history; without a repo there's nothing to record against. */
  isGitRepository: boolean;
  /** Untrusted workspaces stay read-only (§15.1): never write, never nag. */
  trusted: boolean;
  /** This workspace already said no. */
  declined: boolean;
  /**
   * Evidence this repo is actually worked on with an AI tool. "auto" starts
   * silently HERE and asks everywhere else: writing `.chronicle/` into every
   * repo someone merely opens — including ones they don't own — would dirty
   * `git status` in repos they never meant to record.
   */
  aiToolInUse: boolean;
}

export type AutoStartPlan =
  | { action: "start" }
  | { action: "ask" }
  | { action: "none"; reason: string };

/** The whole auto-start decision, as one pure function. */
export function planAutoStart(input: AutoStartInput): AutoStartPlan {
  if (input.initialized) return { action: "none", reason: "already a chronicle project" };
  if (input.mode === "off") return { action: "none", reason: "chronicle.autoStart is off" };
  if (!input.trusted) return { action: "none", reason: "untrusted workspace is read-only" };
  // A folder that isn't a repo isn't a project yet — init would throw, and
  // nagging every scratch folder is worse than staying quiet.
  if (!input.isGitRepository) return { action: "none", reason: "not a git repository" };
  if (input.declined) return { action: "none", reason: "declined for this workspace" };
  if (input.mode === "ask") return { action: "ask" };
  return input.aiToolInUse ? { action: "start" } : { action: "ask" };
}

/**
 * Do you work on this repo with an AI tool? `.claude/` in the repo, or
 * transcripts Claude Code already kept for this path. Best-effort by design
 * (the transcript layout is undocumented) — a false negative costs one
 * question, never a missed recording.
 */
export async function aiToolInUse(folder: string): Promise<boolean> {
  if (existsSync(path.join(folder, ".claude"))) return true;
  try {
    const { transcriptDirsFor } = await import("@gigaichronicle/provider-claude-code");
    return transcriptDirsFor([folder]).some((dir) => existsSync(dir));
  } catch {
    return false;
  }
}

export interface StartResult {
  chronicleDir: string;
  projectName: string;
  /** Workspace-relative paths created — the same honest footprint init prints. */
  touched: string[];
  /** True when live capture is wired, not merely configured. */
  capturing: boolean;
}

/**
 * Start recording a project: scaffold `.chronicle/`, then wire the capture
 * hooks for a detected tool. Throws with a human reason (no git repo,
 * already initialized, unwritable) — the caller turns that into a message.
 */
export async function startChronicle(folder: string): Promise<StartResult> {
  const result = await runInit(folder);
  let capturing = false;
  const touched = [...result.touched];
  if (result.providers["claude-code"] === "auto") {
    try {
      const { wireCapture } = await import("@gigaichronicle/provider-claude-code");
      const wired = wireCapture(path.dirname(result.chronicleDir));
      capturing = wired.live;
      if (wired.changed && wired.file !== null) touched.push(wired.file);
    } catch {
      // unwritable .claude/ — the store still exists; capture stays off and
      // `chronicle status` says so rather than pretending.
    }
  }
  return {
    chronicleDir: result.chronicleDir,
    projectName: result.projectName,
    touched,
    capturing,
  };
}

/** Is this folder a git repository? (Re-exported so callers need one import.) */
export async function folderIsGitRepository(folder: string): Promise<boolean> {
  return isGitRepository(folder).catch(() => false);
}
