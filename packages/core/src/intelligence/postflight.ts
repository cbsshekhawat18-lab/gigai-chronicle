/**
 * Post-flight check (docs/preflight-postflight.md §18) — after work is done, what
 * actually changed? Surfaces scope drift, decisions/TODOs the work introduced,
 * and whether review is warranted. The complement to pre-flight. Deterministic.
 */
import type { EventLog } from "../store/event-log.js";
import type { MemoryItem } from "../memory/schema.js";
import { loadMemory } from "./signals.js";
import { scopeDrift, type ScopeResult } from "./scope.js";

export interface PostflightResult {
  session: string | null;
  task: string | null;
  changedFiles: string[];
  scope: ScopeResult;
  newDecisions: MemoryItem[];
  newTodos: MemoryItem[];
  concerns: string[];
  status: "ok" | "review";
  markdown: string;
}

export async function postflight(
  chronicleDir: string,
  log: EventLog,
  repoRoot: string,
  options: { session?: string } = {},
): Promise<PostflightResult> {
  const scope = await scopeDrift(chronicleDir, log, repoRoot, options);
  const session = scope.session;

  const memory = await loadMemory(chronicleDir, log);
  const fromSession = session === null ? [] : memory.filter((m) => m.relatedSessions.includes(session));
  const newDecisions = fromSession.filter((m) => m.kind === "decision" && m.status === "active");
  const newTodos = fromSession.filter((m) => m.kind === "todo" && m.status !== "resolved");

  const concerns: string[] = [];
  if (scope.unexpected.length > 0) {
    concerns.push(`Changed ${scope.unexpected.length} file(s) outside the task's area: ${scope.unexpected.slice(0, 6).join(", ")}`);
  }
  const openIssues = fromSession.filter((m) => m.kind === "known_issue" && m.status !== "resolved");
  if (openIssues.length > 0) concerns.push(`${openIssues.length} known issue(s) still open in this session`);

  const status: "ok" | "review" = scope.level !== "low" || concerns.length > 0 ? "review" : "ok";

  const lines = [
    "# Chronicle Post-flight",
    "",
    "## Task",
    scope.task ?? "(no stated task for this session)",
    "",
    `## Changed files (${scope.changedFiles.length})`,
    "",
    ...(scope.changedFiles.length > 0 ? scope.changedFiles.map((f) => `- ${f}`) : ["_none attributed_"]),
    "",
    `## Scope: ${scope.level.toUpperCase()}`,
    scope.unexpected.length > 0 ? `Outside expected area: ${scope.unexpected.join(", ")}` : "Within the task's expected area.",
    "",
  ];
  if (newDecisions.length > 0) {
    lines.push("## New decisions detected", "", ...newDecisions.map((m) => `- ${m.content}`), "");
  }
  if (newTodos.length > 0) {
    lines.push("## New TODOs detected", "", ...newTodos.map((m) => `- ${m.content}`), "");
  }
  if (concerns.length > 0) {
    lines.push("## Concerns", "", ...concerns.map((c) => `- ⚠ ${c}`), "");
  }
  lines.push(`## Status`, "", status === "review" ? "REVIEW RECOMMENDED" : "✓ OK", "");

  return { session, task: scope.task, changedFiles: scope.changedFiles, scope, newDecisions, newTodos, concerns, status, markdown: lines.join("\n") + "\n" };
}
