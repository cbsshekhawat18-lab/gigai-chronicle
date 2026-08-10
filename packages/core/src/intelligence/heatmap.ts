/**
 * Development heatmap + work graph (docs/development-intelligence.md §14–15).
 * Where development activity concentrates (not just lines: prompts, churn,
 * repeated fixes), and how files/decisions/issues connect. Deterministic.
 */
import { changesByPrompt } from "../attribution/why.js";
import type { EventLog } from "../store/event-log.js";
import { repeatedProblems } from "./repeat.js";
import { keywords, loadMemory } from "./signals.js";

export interface HeatmapEntry {
  path: string;
  prompts: number;
  churn: number;
  repeatedFixes: number;
  score: number;
}

/** Activity per file: prompt-turns + churn + repeated fixes, ranked. */
export async function heatmap(chronicleDir: string, log: EventLog, repoRoot: string): Promise<HeatmapEntry[]> {
  const changes = await changesByPrompt(repoRoot, { limit: 1000 });
  const byFile = new Map<string, { prompts: number; churn: number }>();
  for (const turn of changes) {
    for (const f of turn.files) {
      if (f.path.startsWith(".chronicle/")) continue;
      const e = byFile.get(f.path) ?? { prompts: 0, churn: 0 };
      e.prompts += 1;
      e.churn += (f.insertions ?? 0) + (f.deletions ?? 0);
      byFile.set(f.path, e);
    }
  }
  const problems = await repeatedProblems(chronicleDir, log);
  const repeatedFixes = new Map<string, number>();
  for (const p of problems) for (const f of p.files) repeatedFixes.set(f, (repeatedFixes.get(f) ?? 0) + p.occurrences);

  const entries: HeatmapEntry[] = [...byFile.entries()].map(([path, e]) => {
    const fixes = repeatedFixes.get(path) ?? 0;
    return { path, prompts: e.prompts, churn: e.churn, repeatedFixes: fixes, score: e.prompts * 2 + Math.round(e.churn / 50) + fixes * 5 };
  });
  return entries.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
}

export interface GraphEdge {
  from: string;
  to: string;
  relation: string;
}

export interface GraphResult {
  root: string;
  nodes: string[];
  edges: GraphEdge[];
}

/**
 * A textual work graph connecting a root (task/file/whole project) to the
 * decisions, issues, failed approaches, and files it relates to via Project
 * Memory + co-change. Not a full dependency graph — an evidence map.
 */
export async function workGraph(
  chronicleDir: string,
  log: EventLog,
  repoRoot: string,
  options: { task?: string; file?: string } = {},
): Promise<GraphResult> {
  const memory = await loadMemory(chronicleDir, log);
  const root = options.task ?? options.file ?? "project";
  const kw = options.task !== undefined ? new Set(keywords(options.task)) : null;

  const relevant = memory.filter((m) => {
    if (options.file !== undefined) return m.relatedFiles.some((f) => f.includes(options.file as string)) || m.content.includes(options.file);
    if (kw !== null) return keywords(`${m.title} ${m.content} ${m.tags.join(" ")}`).some((k) => kw.has(k));
    return m.kind === "decision" || m.kind === "known_issue" || m.kind === "failed_approach";
  });

  const nodes = new Set<string>([root]);
  const edges: GraphEdge[] = [];
  for (const m of relevant.slice(0, 40)) {
    const label = `[${m.kind}] ${m.title}`;
    nodes.add(label);
    edges.push({ from: root, to: label, relation: m.kind === "failed_approach" ? "rejected" : m.kind === "known_issue" ? "issue" : "decides" });
    for (const f of m.relatedFiles.slice(0, 3)) {
      nodes.add(f);
      edges.push({ from: label, to: f, relation: "touches" });
    }
  }
  return { root, nodes: [...nodes], edges };
}
