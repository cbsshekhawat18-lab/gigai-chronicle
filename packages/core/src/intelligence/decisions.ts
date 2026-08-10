/**
 * Decision health & drift (docs/decision-drift.md §6–7). Architecture decisions
 * age and can quietly contradict the code. This reports — never rewrites —
 * evidence that a decision may be stale or drifting. Deterministic, provenance-
 * backed, confidence-labeled.
 */
import type { EventLog } from "../store/event-log.js";
import { buildMemory } from "../memory/engine.js";
import type { MemoryItem } from "../memory/schema.js";
import { loadMemory, keywords, type Provenance } from "./signals.js";

function ageDays(iso: string, now: number): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : Math.max(0, Math.round((now - t) / 86_400_000));
}

export interface DecisionHealthItem {
  id: string;
  title: string;
  ageDays: number;
  relatedChanges: number;
  state: "healthy" | "aging" | "stale" | "conflicting";
  provenance: Provenance[];
}

export interface DecisionHealthReport {
  active: number;
  healthy: number;
  aging: number;
  stale: number;
  conflicting: number;
  items: DecisionHealthItem[];
}

/** Health of every active decision: age, related change volume, conflicts. */
export async function decisionHealth(
  chronicleDir: string,
  log: EventLog,
  options: { now?: string } = {},
): Promise<DecisionHealthReport> {
  const now = Date.parse(options.now ?? new Date().toISOString());
  const memory = await loadMemory(chronicleDir, log);
  const { conflicts } = await buildMemory(chronicleDir, log);
  const conflicted = new Set(conflicts.flatMap((c) => [c.a.id, c.b.id]));

  const active = memory.filter((m) => m.kind === "decision" && m.status === "active");
  const items: DecisionHealthItem[] = active.map((m) => {
    const age = ageDays(m.createdAt, now);
    const state: DecisionHealthItem["state"] = conflicted.has(m.id)
      ? "conflicting"
      : age >= 180
        ? "stale"
        : age >= 90
          ? "aging"
          : "healthy";
    return { id: m.id, title: m.title, ageDays: age, relatedChanges: m.relatedEvents.length, state, provenance: m.sourceRefs.slice(0, 1) };
  });
  items.sort((a, b) => b.ageDays - a.ageDays);

  const count = (s: DecisionHealthItem["state"]): number => items.filter((i) => i.state === s).length;
  return { active: active.length, healthy: count("healthy"), aging: count("aging"), stale: count("stale"), conflicting: count("conflicting"), items };
}

export interface DriftItem {
  decision: string;
  evidence: string;
  level: "possible" | "likely";
  provenance: Provenance[];
}

/**
 * Decision drift: an active decision whose subject later saw a memory item
 * naming a DIFFERENT technology — a signal the decision may have been quietly
 * replaced. Reported as evidence, never auto-resolved.
 */
export async function decisionDrift(chronicleDir: string, log: EventLog): Promise<DriftItem[]> {
  const memory = await loadMemory(chronicleDir, log);
  const active = memory.filter((m) => m.kind === "decision" && m.status === "active" && m.tags.length > 0);
  const drift: DriftItem[] = [];
  for (const d of active) {
    const subj = new Set(keywords(d.content));
    const dTech = new Set(d.tags);
    // Later items on an overlapping subject that name a different technology.
    const contradicting = memory.filter(
      (m) =>
        m.id !== d.id &&
        m.updatedAt > d.updatedAt &&
        m.tags.length > 0 &&
        m.tags.some((t) => !dTech.has(t)) &&
        keywords(m.content).some((k) => subj.has(k)),
    );
    if (contradicting.length > 0) {
      const other = [...new Set(contradicting.flatMap((m) => m.tags).filter((t) => !dTech.has(t)))];
      drift.push({
        decision: d.content,
        evidence: `later work mentions ${other.join(", ")} on the same subject (decision names ${[...dTech].join(", ")})`,
        level: contradicting.length >= 2 ? "likely" : "possible",
        provenance: [d.sourceRefs[0], ...contradicting.slice(0, 1).map((m) => m.sourceRefs[0])].filter((p): p is Provenance => p !== undefined),
      });
    }
  }
  return drift;
}

/** Frame failed/rejected approaches + resolved issues as lessons (§11). */
export function learningsFrom(memory: MemoryItem[]): Array<{ lesson: string; provenance: Provenance[] }> {
  const lessons: Array<{ lesson: string; provenance: Provenance[] }> = [];
  for (const m of memory) {
    if (m.kind === "failed_approach" || (m.kind === "decision" && m.status === "rejected")) {
      lessons.push({ lesson: `Rejected: ${m.content} — don't reintroduce it.`, provenance: m.sourceRefs.slice(0, 1) });
    } else if (m.kind === "decision" && m.status === "superseded") {
      lessons.push({ lesson: `Superseded: ${m.content} — a later decision replaced it.`, provenance: m.sourceRefs.slice(0, 1) });
    } else if (m.kind === "known_issue" && m.status === "resolved") {
      lessons.push({ lesson: `Resolved issue: ${m.content}.`, provenance: m.sourceRefs.slice(0, 1) });
    }
  }
  return lessons;
}
