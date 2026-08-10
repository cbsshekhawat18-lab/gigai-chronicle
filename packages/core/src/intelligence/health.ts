/**
 * Project-level scores (docs/development-intelligence.md §33–36): development
 * health, development DNA, Project Memory health, and the "new AI onboarding
 * test". Every score is a composite of explainable sub-metrics — never opaque —
 * and answers Chronicle's core question: can a new AI understand this project?
 */
import type { EventLog } from "../store/event-log.js";
import { buildMemory } from "../memory/engine.js";
import type { MemoryItem, MemoryKind } from "../memory/schema.js";
import { decisionHealth } from "./decisions.js";
import { technicalDebt } from "./debt.js";
import { repeatedProblems } from "./repeat.js";
import { loadMemory } from "./signals.js";
import { stuckWork, unfinishedWork } from "./work.js";

const pct = (n: number, d: number): number => (d === 0 ? 100 : Math.round((n / d) * 100));
const has = (memory: MemoryItem[], kind: MemoryKind): boolean => memory.some((m) => m.kind === kind);

export interface Metric {
  name: string;
  score: number;
  detail: string;
}

export interface HealthReport {
  overall: number;
  metrics: Metric[];
  warnings: string[];
}

/** Overall development health from explainable sub-metrics. */
export async function projectHealth(chronicleDir: string, log: EventLog): Promise<HealthReport> {
  const memory = await loadMemory(chronicleDir, log);
  const decisions = await decisionHealth(chronicleDir, log);
  const debt = await technicalDebt(chronicleDir, log);
  const stuck = await stuckWork(chronicleDir, log);
  const unfinished = await unfinishedWork(chronicleDir, log);

  const memoryScore = memory.length === 0 ? 0 : Math.min(100, memory.length * 4 + (has(memory, "architecture") ? 20 : 0));
  const decisionScore = decisions.active === 0 ? 100 : pct(decisions.healthy, decisions.active);
  const stability = Math.max(0, 100 - stuck.length * 20);
  const debtScore = Math.max(0, 100 - debt.length * 8);
  const flow = Math.max(0, 100 - stuck.reduce((s, x) => s + x.attempts, 0) * 3);
  const unfinishedScore = Math.max(0, 100 - unfinished.length * 6);

  const metrics: Metric[] = [
    { name: "Memory", score: memoryScore, detail: `${memory.length} memory items${has(memory, "architecture") ? ", architecture recorded" : ""}` },
    { name: "Decisions", score: decisionScore, detail: `${decisions.healthy}/${decisions.active} active decisions healthy` },
    { name: "Stability", score: stability, detail: `${stuck.length} stalled task(s)` },
    { name: "Technical debt", score: debtScore, detail: `${debt.length} debt item(s)` },
    { name: "Development flow", score: flow, detail: `${stuck.reduce((s, x) => s + x.attempts, 0)} repeated attempt(s)` },
    { name: "Unfinished work", score: unfinishedScore, detail: `${unfinished.length} open item(s)` },
  ];
  const overall = Math.round(metrics.reduce((s, m) => s + m.score, 0) / metrics.length);

  const warnings: string[] = [];
  for (const s of stuck) warnings.push(`"${s.subject}" appears stalled (${s.sessions} sessions, no resolution).`);
  if (decisions.stale > 0) warnings.push(`${decisions.stale} architectural decision(s) appear stale (>180 days).`);
  if (debt.filter((d) => d.level === "high").length > 0) warnings.push(`${debt.filter((d) => d.level === "high").length} high-severity technical-debt item(s).`);

  return { overall, metrics, warnings };
}

export interface Dna {
  mostActiveArea: string | null;
  mostRepeatedProblem: string | null;
  highRiskFiles: number;
  technicalDebt: number;
  unresolvedDecisions: number;
  changePattern: string;
}

/** A repository DEVELOPMENT profile (not user profiling) — derived from evidence. */
export async function developmentDna(chronicleDir: string, log: EventLog): Promise<Dna> {
  const memory = await loadMemory(chronicleDir, log);
  const problems = await repeatedProblems(chronicleDir, log);
  const debt = await technicalDebt(chronicleDir, log);
  const { conflicts } = await buildMemory(chronicleDir, log);
  const tagCounts = new Map<string, number>();
  for (const m of memory) for (const t of m.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  const mostActiveArea = [...tagCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const changePattern =
    memory.filter((m) => m.kind === "decision").length > memory.filter((m) => m.kind === "todo").length
      ? "decision-driven"
      : "incremental";
  return {
    mostActiveArea,
    mostRepeatedProblem: problems.find((p) => !p.resolved)?.subject ?? null,
    highRiskFiles: 0, // populated by callers that scan files; kept honest at the project level
    technicalDebt: debt.length,
    unresolvedDecisions: conflicts.length,
    changePattern,
  };
}

export interface MemoryHealth {
  overall: number;
  metrics: Metric[];
  recommendations: string[];
}

/** Is the project understandable to a NEW AI? Coverage of what it needs. */
export async function memoryHealth(chronicleDir: string, log: EventLog): Promise<MemoryHealth> {
  const memory = await loadMemory(chronicleDir, log);
  const withProvenance = memory.filter((m) => m.sourceRefs.length > 0).length;
  const metrics: Metric[] = [
    { name: "Architecture coverage", score: has(memory, "architecture") || has(memory, "project") ? 90 : 40, detail: has(memory, "architecture") ? "architecture recorded" : "no architecture item" },
    { name: "Decision provenance", score: pct(withProvenance, memory.length), detail: `${withProvenance}/${memory.length} items have provenance` },
    { name: "Current work clarity", score: has(memory, "current_work") ? 85 : 50, detail: has(memory, "current_work") ? "current work recorded" : "no current-work item" },
    { name: "Known-issue coverage", score: has(memory, "known_issue") ? 80 : 60, detail: `${memory.filter((m) => m.kind === "known_issue").length} known issue(s)` },
    { name: "Failed-approach coverage", score: has(memory, "failed_approach") ? 85 : 65, detail: `${memory.filter((m) => m.kind === "failed_approach").length} rejected approach(es)` },
  ];
  const overall = memory.length === 0 ? 0 : Math.round(metrics.reduce((s, m) => s + m.score, 0) / metrics.length);
  const recommendations: string[] = [];
  if (!has(memory, "architecture")) recommendations.push("Record the architecture (a short decision/architecture note).");
  if (pct(withProvenance, memory.length) < 100) recommendations.push("Some items lack provenance — rebuild memory.");
  if (!has(memory, "current_work")) recommendations.push("No current-work signal — capture what you're working on.");
  return { overall, metrics, recommendations };
}

export interface OnboardingTest {
  overall: number;
  metrics: Metric[];
  ready: boolean;
  gaps: string[];
}

/** Simulate a brand-new AI entering the repo: how much can it understand? (§36) */
export async function onboardingTest(chronicleDir: string, log: EventLog): Promise<OnboardingTest> {
  const mh = await memoryHealth(chronicleDir, log);
  const memory = await loadMemory(chronicleDir, log);
  const gaps: string[] = [...mh.recommendations];
  const noProv = memory.filter((m) => m.sourceRefs.length === 0);
  if (noProv.length > 0) gaps.push(`${noProv.length} item(s) have no provenance.`);
  const stale = memory.filter((m) => m.kind === "decision" && m.status === "active").length === 0 && memory.length > 0;
  if (stale) gaps.push("No active decisions recorded — the project's direction is unclear.");
  const ready = mh.overall >= 75 && gaps.length === 0;
  return { overall: mh.overall, metrics: mh.metrics, ready, gaps };
}
