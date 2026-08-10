/**
 * Scope drift (docs/development-intelligence.md §19) — did the work touch areas
 * beyond what the task called for? AI agents sometimes change far more than
 * requested; this flags it deterministically by comparing the session's stated
 * task (its first prompt) with the files that session actually changed.
 */
import { changesByPrompt } from "../attribution/why.js";
import { resolveEventText } from "../knowledge/knowledge.js";
import type { EventLog } from "../store/event-log.js";
import { keywords } from "./signals.js";

export interface ScopeResult {
  session: string | null;
  /** The session's stated intent (its first human prompt). */
  task: string | null;
  /** Keywords the task implies — the "expected area". */
  expectedArea: string[];
  changedFiles: string[];
  /** Changed files whose path matches none of the task keywords. */
  unexpected: string[];
  level: "low" | "medium" | "high";
  note: string;
}

/** Detect scope drift for a session (default: the most recent one). */
export async function scopeDrift(
  chronicleDir: string,
  log: EventLog,
  repoRoot: string,
  options: { session?: string } = {},
): Promise<ScopeResult> {
  // Resolve the target session + its first human prompt + its prompt eventIds.
  let target = options.session ?? null;
  let task: string | null = null;
  const sessionEventIds = new Map<string, Set<string>>();
  const firstPrompt = new Map<string, string>();
  for await (const scanned of log.scan({ visibility: "all" })) {
    const event = scanned.event;
    // Privacy: never read local (private) text into shared intelligence output.
    if (event.meta.visibility === "local") continue;
    const ses = event.session ?? null;
    if (ses === null) continue;
    if (options.session === undefined) target = ses; // default: last session seen
    if (event.type === "PromptSubmitted" || event.type === "PromptEdited") {
      const ids = sessionEventIds.get(ses) ?? new Set<string>();
      ids.add(event.id);
      sessionEventIds.set(ses, ids);
      if (!firstPrompt.has(ses)) {
        const body = await resolveEventText(chronicleDir, scanned);
        if (body !== null) firstPrompt.set(ses, body.split("\n").find((l) => l.trim().length >= 4)?.trim() ?? "");
      }
    }
  }
  if (target === null) {
    return { session: null, task: null, expectedArea: [], changedFiles: [], unexpected: [], level: "low", note: "No sessions captured." };
  }
  task = firstPrompt.get(target) ?? null;
  const wanted = sessionEventIds.get(target) ?? new Set<string>();

  // Files that session changed (attribution turns whose event is in the session).
  const changes = await changesByPrompt(repoRoot, { limit: 1000 });
  const changedFiles = [
    ...new Set(changes.filter((c) => wanted.has(c.eventId)).flatMap((c) => c.files.map((f) => f.path))),
  ]
    .filter((f) => !f.startsWith(".chronicle/"))
    .sort();

  const expectedArea = task !== null ? keywords(task) : [];
  const unexpected =
    expectedArea.length === 0
      ? []
      : changedFiles.filter((f) => !expectedArea.some((k) => f.toLowerCase().includes(k)));

  const ratio = changedFiles.length === 0 ? 0 : unexpected.length / changedFiles.length;
  const level = ratio >= 0.5 && unexpected.length >= 2 ? "high" : unexpected.length >= 1 ? "medium" : "low";

  return {
    session: target,
    task,
    expectedArea,
    changedFiles,
    unexpected,
    level,
    note:
      changedFiles.length === 0
        ? "No attributed file changes for this session yet."
        : unexpected.length === 0
          ? "Changes stayed within the task's expected area."
          : "Some changed files fall outside the task's keywords — review whether that was intended.",
  };
}
