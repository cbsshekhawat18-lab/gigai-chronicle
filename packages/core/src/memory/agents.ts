/**
 * AI instruction files (docs/ai-continuity.md §24) — small, provider-neutral
 * pointers that tell whatever agent opens the repo how to load Chronicle's
 * persistent memory. Deliberately tiny: they POINT at the commands, they do not
 * inline the whole Project Memory (which changes and would go stale).
 */

/** The instruction files Chronicle can generate — all provider-neutral. */
export const AGENT_FILES = ["AGENTS.md", "CLAUDE.md", "GEMINI.md"] as const;
export type AgentFile = (typeof AGENT_FILES)[number];

/**
 * The (small) body written to each agent instruction file. Same content for
 * every file — the guidance is provider-neutral by design.
 */
export function agentInstructions(projectName?: string): string {
  const name = projectName !== undefined && projectName.trim() !== "" ? projectName.trim() : "This project";
  return [
    "# Gigai Chronicle — AI Development Memory",
    "",
    `${name} uses Gigai Chronicle for persistent development memory. You are NOT`,
    "starting from scratch — earlier work, decisions, and constraints are recorded.",
    "",
    "**Before significant development work**, load the project state:",
    "",
    "```bash",
    "chronicle bootstrap                              # project state + rules + next step",
    'chronicle project context --task "<your task>"   # task-scoped briefing',
    "chronicle context <file>                         # why a file looks the way it does",
    "```",
    "",
    "**Before ending a session**, record a handoff for the next agent:",
    "",
    "```bash",
    "chronicle handoff",
    "```",
    "",
    "Rules:",
    "- Respect active Chronicle decisions and constraints.",
    "- Do NOT repeat approaches marked failed or superseded.",
    "- Treat superseded items as history, not current truth.",
    "- Verify the current code still matches these decisions before acting.",
    "",
    "_Chronicle is local-first and never calls a model; it briefs the one you do._",
    "",
  ].join("\n");
}
