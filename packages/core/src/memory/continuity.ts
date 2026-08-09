/**
 * AI continuity (docs/ai-continuity.md) — the payoff of Project Memory: any AI
 * agent can enter a Chronicle-enabled project and continue where the last one
 * stopped, without the developer re-explaining anything.
 *
 * - bootstrap: onboard a brand-new agent (rules + full current state + next step)
 * - continue:  a ready-to-paste "pick up where we left off" prompt
 * - handoff:   an end-of-session record, persisted into memory for the next agent
 *
 * All three are assembled from the same Project Memory + Context Engine. Model-free.
 */
import type { EventLog } from "../store/event-log.js";
import { buildProjectContext, type ProjectContextOptions } from "./context.js";
import { buildMemory } from "./engine.js";
import { listMemory, writeMemory } from "./store.js";
import { MEMORY_SCHEMA_VERSION, memoryId, type MemoryItem, type MemorySource } from "./schema.js";

export type ContinuityOptions = ProjectContextOptions;

export interface Continuity {
  markdown: string;
  empty: boolean;
}

async function memoryItems(chronicleDir: string, log: EventLog, includeLocal: boolean): Promise<MemoryItem[]> {
  const stored = await listMemory(chronicleDir, { includeLocal });
  return stored.length > 0 ? stored : (await buildMemory(chronicleDir, log, { includeLocal })).items;
}

/** The single most useful next action — an open issue, else a TODO, else current work. */
function recommendedNextStep(items: MemoryItem[]): string | null {
  const pick = (kind: MemoryItem["kind"]): MemoryItem | undefined =>
    items
      .filter((m) => m.kind === kind && m.status !== "resolved" && m.status !== "rejected")
      .sort((a, b) => b.confidence - a.confidence || b.updatedAt.localeCompare(a.updatedAt))[0];
  const next = pick("known_issue") ?? pick("todo") ?? pick("current_work");
  return next?.content ?? null;
}

/**
 * Bootstrap a brand-new AI agent: the standing rules, the full current project
 * state (via the Context Engine), and a recommended next step.
 */
export async function buildBootstrap(
  chronicleDir: string,
  log: EventLog,
  repoRoot: string,
  options: ContinuityOptions = {},
): Promise<Continuity> {
  const ctx = await buildProjectContext(chronicleDir, log, repoRoot, options);
  const items = await memoryItems(chronicleDir, log, options.includeLocal === true);
  const next = recommendedNextStep(items);
  const name = repoRoot.split("/").filter(Boolean).pop() ?? "this project";

  const preamble = [
    `# Gigai Chronicle — Bootstrap: ${name}`,
    "",
    "You are entering an EXISTING software project that uses Gigai Chronicle for",
    "persistent development memory. You are NOT starting from scratch.",
    "",
    "Before making changes:",
    "1. Understand the project, architecture, and current work below.",
    "2. Respect the active decisions and constraints.",
    "3. Review known issues and previously FAILED approaches — do not repeat them.",
    "4. Treat superseded items as history, not current truth.",
    "5. Inspect the relevant files and verify the code still matches these decisions",
    "   before acting.",
    "",
    "---",
    "",
  ].join("\n");

  const tail =
    next !== null
      ? ["", "## Recommended Next Step", "", next, ""].join("\n")
      : "";

  // ctx.markdown already carries the project sections; drop its H1 to nest cleanly.
  const body = ctx.markdown.replace(/^# [^\n]*\n/u, "");
  return { markdown: preamble + body + tail, empty: ctx.empty };
}

/**
 * A ready-to-paste continuation prompt for the next AI session.
 */
export async function buildContinue(
  chronicleDir: string,
  log: EventLog,
  repoRoot: string,
  options: ContinuityOptions = {},
): Promise<Continuity> {
  const ctx = await buildProjectContext(chronicleDir, log, repoRoot, options);
  const items = await memoryItems(chronicleDir, log, options.includeLocal === true);
  const next = recommendedNextStep(items);

  const head = [
    "Continue development on this EXISTING project. You are not starting from scratch.",
    "The context below is your own accumulated Chronicle development memory.",
    "",
  ].join("\n");
  const body = ctx.markdown.replace(/^# [^\n]*\n/u, "");
  const foot = [
    "",
    "## How to proceed",
    "",
    "Before modifying code, inspect the relevant files and verify the current",
    "implementation still matches the decisions above. Do NOT repeat any approach",
    "listed as failed or superseded.",
    next !== null ? `\nSuggested focus: ${next}` : "",
    "",
    "Start by explaining your implementation plan.",
  ].join("\n");
  return { markdown: head + body + foot, empty: ctx.empty };
}

/**
 * A development handoff — completed / in-progress / next / decisions / issues /
 * failed approaches — PERSISTED into Project Memory so the next agent inherits
 * it. Returns the rendered handoff and the stored item (null when there are no
 * events to attribute it to).
 */
export async function buildHandoff(
  chronicleDir: string,
  log: EventLog,
  repoRoot: string,
  options: ContinuityOptions & { objective?: string; now?: string } = {},
): Promise<Continuity & { item: MemoryItem | null }> {
  const includeLocal = options.includeLocal === true;
  const items = await memoryItems(chronicleDir, log, includeLocal);

  // Provenance = the last captured event (a handoff must trace to real history).
  let last: MemorySource | null = null;
  let lastTs = "";
  for await (const { event } of log.scan({ visibility: includeLocal ? "all" : "shared" })) {
    last = { session: event.session ?? null, event: event.id };
    lastTs = event.ts;
  }

  const bySection = (heading: string, kinds: MemoryItem["kind"][], status?: (m: MemoryItem) => boolean): string[] => {
    const matched = items.filter((m) => kinds.includes(m.kind) && (status === undefined || status(m)));
    if (matched.length === 0) return [`## ${heading}`, "", "_none recorded_", ""];
    return [`## ${heading}`, "", ...matched.map((m) => `- ${m.content}`), ""];
  };

  const next = recommendedNextStep(items);
  const objective = options.objective ?? recommendedNextStep(items.filter((m) => m.kind === "current_work")) ?? "(not specified)";

  const lines = [
    "# Development Handoff",
    "",
    "## Objective",
    "",
    objective,
    "",
    ...bySection("Completed", ["completed_work"]),
    ...bySection("In Progress", ["current_work"]),
    ...(next !== null ? ["## Next Step", "", next, ""] : ["## Next Step", "", "_none recorded_", ""]),
    ...bySection("Active Decisions", ["decision"], (m) => m.status === "active"),
    ...bySection("Constraints", ["constraint"], (m) => m.status !== "rejected"),
    ...bySection("Known Issues", ["known_issue"], (m) => m.status !== "resolved"),
    ...bySection("Failed / Superseded Approaches", ["failed_approach"]),
    ...bySection("Remaining TODOs", ["todo"], (m) => m.status !== "resolved"),
    "---",
    "_Generated by Chronicle from Project Memory; provenance in the stored item._",
  ];
  const markdown = lines.join("\n") + "\n";

  let item: MemoryItem | null = null;
  if (last !== null) {
    const content = markdown;
    const id = memoryId("handoff", content);
    item = {
      id,
      schemaVersion: MEMORY_SCHEMA_VERSION,
      kind: "handoff",
      title: `Handoff — ${objective}`.slice(0, 80),
      content,
      status: "active",
      factType: "fact",
      confidence: 0.9,
      createdAt: options.now ?? lastTs,
      updatedAt: options.now ?? lastTs,
      sourceRefs: [last],
      relatedFiles: [],
      relatedEvents: last.event !== null ? [last.event] : [],
      relatedSessions: last.session !== null ? [last.session] : [],
      supersedes: null,
      supersededBy: null,
      tags: [],
      visibility: "shared",
    };
    await writeMemory(chronicleDir, item);
  }

  return { markdown, empty: items.length === 0, item };
}
