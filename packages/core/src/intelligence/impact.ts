/**
 * Change Impact Radar (docs/development-intelligence.md §5) — what a change to a
 * file is likely to touch, from CO-CHANGE history (files that changed together
 * in the same captured turns) plus the historical dependencies recorded in
 * Project Memory. This is not a static dependency analyzer; confidence is
 * labeled and every entry traces to history.
 */
import { changesByPrompt } from "../attribution/why.js";
import type { EventLog } from "../store/event-log.js";
import { fileRisk } from "./risk.js";
import { collectFileEvidence } from "./signals.js";

export interface AffectedFile {
  file: string;
  coChanges: number;
  band: "high" | "medium" | "low";
}

export interface ImpactResult {
  target: string;
  affected: AffectedFile[];
  /** Decisions / constraints / issues / failed approaches recorded for this file. */
  historicalDependencies: string[];
  riskLevel: "low" | "medium" | "high";
  note: string;
}

/** Files that historically changed in the same turns as `target`, ranked. */
async function coChange(repoRoot: string, target: string): Promise<Map<string, number>> {
  const changes = await changesByPrompt(repoRoot, { limit: 1000 });
  const counts = new Map<string, number>();
  for (const turn of changes) {
    const files = turn.files.map((f) => f.path);
    if (!files.includes(target)) continue;
    for (const f of files) {
      if (f === target || f.startsWith(".chronicle/")) continue;
      counts.set(f, (counts.get(f) ?? 0) + 1);
    }
  }
  return counts;
}

function band(n: number): "high" | "medium" | "low" {
  return n >= 3 ? "high" : n === 2 ? "medium" : "low";
}

export async function changeImpact(
  chronicleDir: string,
  log: EventLog,
  repoRoot: string,
  target: string,
): Promise<ImpactResult> {
  const counts = await coChange(repoRoot, target);
  const affected: AffectedFile[] = [...counts.entries()]
    .map(([file, coChanges]) => ({ file, coChanges, band: band(coChanges) }))
    .sort((a, b) => b.coChanges - a.coChanges || a.file.localeCompare(b.file));

  const evidence = await collectFileEvidence(chronicleDir, log, repoRoot, target);
  const historicalDependencies = evidence.memory
    .filter((m) => m.kind === "decision" || m.kind === "constraint" || m.kind === "known_issue" || m.kind === "failed_approach")
    .map((m) => m.content)
    .slice(0, 8);

  const risk = await fileRisk(chronicleDir, log, repoRoot, target);

  return {
    target,
    affected,
    historicalDependencies,
    riskLevel: risk.level,
    note:
      affected.length === 0
        ? "No co-change history yet — impact is unknown, not zero. It grows as capture records changes."
        : "Co-change is historical correlation, not a proven dependency. Review the HIGH band first.",
  };
}
