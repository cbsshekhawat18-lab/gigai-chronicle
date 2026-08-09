/**
 * Pre-flight check (docs/preflight-postflight.md §17) — "can I safely make this
 * change?" Before code is written, combine Project Memory + previous attempts +
 * risk into a single briefing: what's already decided, what was already tried and
 * rejected, what this may contradict, and what to review/test. Deterministic;
 * findings are labeled, never asserted as certainty.
 */
import type { EventLog } from "../store/event-log.js";
import type { MemoryItem } from "../memory/schema.js";
import { repeatedProblems, type RepeatedProblem } from "./repeat.js";
import { keywords, loadMemory, type Provenance } from "./signals.js";

const CHANGE_VERB = /\b(?:replace|change|switch|migrate|remove|drop|rewrite|refactor|revert)\b/i;

export interface Contradiction {
  text: string;
  provenance: Provenance[];
}

export interface PreflightResult {
  task: string;
  contradictions: Contradiction[];
  previousAttempts: RepeatedProblem[];
  relevantDecisions: MemoryItem[];
  knownRisks: string[];
  affectedAreas: string[];
  riskLevel: "low" | "medium" | "high";
  recommendedReview: string[];
  suggestedTests: string[];
  verdict: "proceed" | "review" | "caution";
  markdown: string;
}

function itemKeywords(m: MemoryItem): Set<string> {
  return new Set(keywords(`${m.title} ${m.content} ${m.tags.join(" ")}`));
}

export async function preflight(
  chronicleDir: string,
  log: EventLog,
  repoRoot: string,
  task: string,
): Promise<PreflightResult> {
  const taskKw = new Set(keywords(task));
  const changing = CHANGE_VERB.test(task);
  const memory = await loadMemory(chronicleDir, log);

  const relevant = memory.filter((m) => {
    const ik = itemKeywords(m);
    for (const k of taskKw) if (ik.has(k)) return true;
    return false;
  });

  const relevantDecisions = relevant.filter(
    (m) => (m.kind === "decision" && m.status === "active") || (m.kind === "constraint" && m.status !== "rejected"),
  );
  const rejected = relevant.filter(
    (m) => m.kind === "failed_approach" || (m.kind === "decision" && (m.status === "superseded" || m.status === "rejected")),
  );
  const knownRisks = relevant.filter((m) => m.kind === "known_issue" && m.status !== "resolved").map((m) => m.content);

  const contradictions: Contradiction[] = [];
  for (const m of rejected) {
    contradictions.push({ text: `Already tried and rejected — the task may reintroduce it: ${m.content}`, provenance: m.sourceRefs.slice(0, 1) });
  }
  if (changing) {
    for (const m of relevantDecisions.filter((d) => d.kind === "decision")) {
      contradictions.push({ text: `This may reverse an active decision: ${m.content}`, provenance: m.sourceRefs.slice(0, 1) });
    }
  }

  const previousAttempts = (await repeatedProblems(chronicleDir, log, { task })).filter((p) => !p.resolved);

  const affectedAreas = [...new Set(relevant.flatMap((m) => m.tags))].sort();

  const riskLevel: "low" | "medium" | "high" =
    contradictions.length > 0 || previousAttempts.length > 0
      ? "high"
      : relevantDecisions.length > 0 || knownRisks.length > 0
        ? "medium"
        : "low";

  const recommendedReview = [
    ...contradictions.map((c) => c.text),
    ...previousAttempts.map((p) => `Previous unresolved attempts at "${p.subject}" (${p.occurrences}×)`),
  ];

  const suggestedTests = [
    ...knownRisks.map((r) => `Regression test for: ${r}`),
    ...(affectedAreas.length > 0 ? [`Tests covering: ${affectedAreas.join(", ")}`] : []),
  ];

  const verdict: "proceed" | "review" | "caution" =
    contradictions.length > 0 ? "caution" : riskLevel === "high" || riskLevel === "medium" ? "review" : "proceed";

  return {
    task,
    contradictions,
    previousAttempts,
    relevantDecisions,
    knownRisks,
    affectedAreas,
    riskLevel,
    recommendedReview,
    suggestedTests,
    verdict,
    markdown: render(task, { contradictions, previousAttempts, relevantDecisions, knownRisks, affectedAreas, riskLevel, recommendedReview, suggestedTests, verdict } as PreflightResult),
  };
}

function render(task: string, r: PreflightResult): string {
  const verdictLabel = r.verdict === "caution" ? "⚠ REVIEW BEFORE IMPLEMENTING" : r.verdict === "review" ? "REVIEW RECOMMENDED" : "✓ LOOKS CLEAR";
  const lines = [
    "# Chronicle Pre-flight",
    "",
    `## Task`,
    task,
    "",
    `## Risk: ${r.riskLevel.toUpperCase()}`,
    "",
  ];
  if (r.contradictions.length > 0) {
    lines.push("## Potential contradictions", "");
    for (const c of r.contradictions) lines.push(`- ⚠ ${c.text}`);
    lines.push("");
  }
  if (r.previousAttempts.length > 0) {
    lines.push("## Previous attempts", "");
    for (const p of r.previousAttempts) lines.push(`- "${p.subject}" — ${p.occurrences}× across ${p.sessions.length} sessions, unresolved`);
    lines.push("");
  }
  if (r.relevantDecisions.length > 0) {
    lines.push("## Active decisions & constraints", "");
    for (const m of r.relevantDecisions) lines.push(`- ${m.content}`);
    lines.push("");
  }
  if (r.knownRisks.length > 0) {
    lines.push("## Known risks", "");
    for (const k of r.knownRisks) lines.push(`- ${k}`);
    lines.push("");
  }
  if (r.affectedAreas.length > 0) lines.push(`## Affected areas`, "", r.affectedAreas.join(", "), "");
  if (r.suggestedTests.length > 0) {
    lines.push("## Suggested tests", "");
    for (const t of r.suggestedTests) lines.push(`- ${t}`);
    lines.push("");
  }
  lines.push(`## Verdict`, "", verdictLabel, "", "_Deterministic, from captured history — review recommendations, don't treat as certainty._");
  return lines.join("\n") + "\n";
}
