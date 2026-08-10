/**
 * The Context Engine (docs/context-engine.md) — turn Project Memory into an
 * AI-ready briefing scoped to a task, a file, or the whole project, within a
 * token budget. Retrieval → relevance ranking → state filtering (current vs
 * superseded, so a new AI never treats stale decisions as live) → budgeting →
 * a paste-ready Markdown pack. Deterministic and model-free.
 */
import type { EventLog } from "../store/event-log.js";
import { buildMemory } from "./engine.js";
import { listMemory } from "./store.js";
import type { MemoryItem, MemoryKind } from "./schema.js";

export interface ProjectContextOptions {
  /** Rank toward a specific task ("fix the refresh-token bug"). */
  task?: string;
  /** Rank toward a specific file. */
  file?: string;
  /** Approximate token budget for the whole pack (default 8000). */
  budget?: number;
  /** Only memory updated at/after this ISO timestamp. */
  since?: string;
  /** Terser (fewer items) or fuller output. */
  mode?: "compact" | "normal" | "full";
  /** Owner-only: include local (private-derived) memory. */
  includeLocal?: boolean;
}

export interface ProjectContext {
  markdown: string;
  /** Items actually included (after ranking + budget). */
  included: MemoryItem[];
  /** Total items considered. */
  considered: number;
  /** True when there is no memory to brief from. */
  empty: boolean;
}

/** ~4 chars per token — a deliberately rough, dependency-free estimate. */
function estTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const STOP = new Set([
  "the", "a", "an", "for", "to", "of", "in", "on", "and", "or", "we", "use",
  "using", "with", "as", "is", "will", "be", "our", "this", "that", "it", "fix",
  "add", "the", "implement", "make", "please", "can", "you", "i", "how", "do",
]);

function keywords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s/._-]/gu, " ")
      .split(/\s+/u)
      .map((w) => w.replace(/s$/u, ""))
      .filter((w) => w.length >= 3 && !STOP.has(w)),
  );
}

function overlapScore(a: Set<string>, hay: string): number {
  const h = hay.toLowerCase();
  let hits = 0;
  for (const w of a) if (h.includes(w)) hits += 1;
  return hits;
}

/** Baseline importance by kind — what a new agent needs first. */
const KIND_WEIGHT: Record<MemoryKind, number> = {
  current_work: 9,
  constraint: 8,
  decision: 8,
  requirement: 7,
  architecture: 7,
  known_issue: 6,
  failed_approach: 6,
  integration: 5,
  dependency: 5,
  important_file: 5,
  todo: 4,
  project: 6,
  completed_work: 3,
  test_gap: 4,
  handoff: 2,
};

/** Section order + heading for the rendered pack. */
const SECTIONS: Array<{ heading: string; match: (m: MemoryItem) => boolean }> = [
  { heading: "Project", match: (m) => m.kind === "project" },
  { heading: "Architecture", match: (m) => m.kind === "architecture" || m.kind === "integration" },
  { heading: "Current Work", match: (m) => m.kind === "current_work" },
  { heading: "Active Decisions", match: (m) => m.kind === "decision" && m.status === "active" },
  { heading: "Constraints", match: (m) => m.kind === "constraint" && m.status !== "rejected" },
  { heading: "Requirements", match: (m) => m.kind === "requirement" },
  { heading: "Dependencies", match: (m) => m.kind === "dependency" },
  { heading: "Important Files", match: (m) => m.kind === "important_file" },
  { heading: "Known Issues", match: (m) => m.kind === "known_issue" && m.status !== "resolved" },
  { heading: "Next Steps / TODOs", match: (m) => m.kind === "todo" && m.status !== "resolved" },
  {
    heading: "Failed / Superseded Approaches (do NOT repeat)",
    match: (m) => m.kind === "failed_approach" || (m.kind === "decision" && (m.status === "superseded" || m.status === "rejected")),
  },
  { heading: "Recent Work", match: (m) => m.kind === "completed_work" },
];

function rank(item: MemoryItem, taskKw: Set<string>, file: string | undefined): number {
  let s = KIND_WEIGHT[item.kind] ?? 3;
  s += item.confidence * 2;
  if (item.status === "active") s += 2;
  else if (item.status === "superseded" || item.status === "rejected") s -= 1;
  const hay = `${item.title} ${item.content} ${item.tags.join(" ")} ${item.relatedFiles.join(" ")}`;
  if (taskKw.size > 0) s += overlapScore(taskKw, hay) * 4; // task relevance dominates
  if (file !== undefined) {
    if (item.relatedFiles.some((f) => f.includes(file) || file.includes(f))) s += 8;
    if (hay.toLowerCase().includes(file.toLowerCase())) s += 3;
  }
  return s;
}

/**
 * Build a project context pack. Reads the persisted memory store; if it is
 * empty (never rebuilt), falls back to deriving fresh from the event history so
 * the command always works. Ranks by relevance, keeps current state distinct
 * from superseded, and fits everything into the token budget.
 */
export async function buildProjectContext(
  chronicleDir: string,
  log: EventLog,
  repoRoot: string,
  options: ProjectContextOptions = {},
): Promise<ProjectContext> {
  const includeLocal = options.includeLocal === true;
  let items = await listMemory(chronicleDir, { includeLocal });
  if (items.length === 0) items = (await buildMemory(chronicleDir, log, { includeLocal })).items;
  if (options.since !== undefined) items = items.filter((m) => m.updatedAt >= (options.since as string));

  const considered = items.length;
  if (considered === 0) {
    return { markdown: renderEmpty(options), included: [], considered: 0, empty: true };
  }

  const budget = options.budget ?? (options.mode === "compact" ? 2000 : options.mode === "full" ? 32000 : 8000);
  const taskKw = options.task !== undefined ? keywords(options.task) : new Set<string>();

  // Rank, then greedily fill the budget (highest-relevance first).
  const ranked = items
    .map((m) => ({ m, score: rank(m, taskKw, options.file) }))
    .sort((a, b) => b.score - a.score || b.m.confidence - a.m.confidence || a.m.id.localeCompare(b.m.id));

  const header = renderHeader(repoRoot, options);
  let used = estTokens(header);
  const included: MemoryItem[] = [];
  for (const { m } of ranked) {
    const cost = estTokens(`- ${m.title} ${m.content}`) + 4;
    if (used + cost > budget && included.length > 0) continue;
    included.push(m);
    used += cost;
  }

  return {
    markdown: render(header, included),
    included,
    considered,
    empty: false,
  };
}

function renderHeader(repoRoot: string, options: ProjectContextOptions): string {
  const name = repoRoot.split("/").filter(Boolean).pop() ?? "this project";
  const lines = [`# Project Context — ${name}`, ""];
  if (options.task !== undefined) lines.push(`_Scoped to task: **${options.task}**_`, "");
  else if (options.file !== undefined) lines.push(`_Scoped to file: **${options.file}**_`, "");
  lines.push(
    "_Assembled from your own Chronicle development memory — decisions, constraints, and",
    "unfinished work distilled from the captured history. Current state is separated from",
    "superseded/failed approaches so you don't repeat them. Chronicle never calls a model._",
    "",
  );
  return lines.join("\n");
}

function provenance(m: MemoryItem): string {
  const src = m.sourceRefs[0];
  return src === undefined ? "" : `  _(${src.session ?? "-"}/${src.event ?? "-"})_`;
}

function render(header: string, items: MemoryItem[]): string {
  const lines = [header.trimEnd(), ""];
  const shown = new Set<string>();
  for (const section of SECTIONS) {
    const matched = items.filter((m) => section.match(m) && !shown.has(m.id));
    if (matched.length === 0) continue;
    lines.push(`## ${section.heading}`, "");
    for (const m of matched) {
      shown.add(m.id);
      const tag = m.status !== "active" && m.kind !== "failed_approach" ? ` _[${m.status}]_` : "";
      lines.push(`- ${m.content}${tag}${provenance(m)}`);
    }
    lines.push("");
  }
  lines.push(
    "---",
    "_Derived from the Chronicle record on this machine. Every line above traces to a",
    "captured event (see the provenance refs). Verify against the current code before acting._",
  );
  return lines.join("\n") + "\n";
}

function renderEmpty(options: ProjectContextOptions): string {
  const scope = options.task !== undefined ? ` for "${options.task}"` : options.file !== undefined ? ` for ${options.file}` : "";
  return (
    `# Project Context${scope}\n\n` +
    "_No Project Memory yet — nothing to brief. Chronicle builds memory from captured\n" +
    "development history; run `chronicle memory rebuild` after some sessions, or start\n" +
    "working with capture running._\n"
  );
}
