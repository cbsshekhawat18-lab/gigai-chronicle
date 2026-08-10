/**
 * Risk Engine (docs/risk-engine.md) — an EXPLAINABLE 0–100 risk score for a
 * file, from deterministic signals. Every point is attributable: the result
 * always carries the signals that produced it. No opaque AI number.
 */
import type { EventLog } from "../store/event-log.js";
import {
  collectFileEvidence,
  levelOf,
  memProvenance,
  scoreOf,
  type FileEvidence,
  type Signal,
} from "./signals.js";

export interface RiskResult {
  file: string;
  score: number;
  level: "low" | "medium" | "high";
  signals: Signal[];
  /** How to read this — confidence is inherent, not a promise. */
  note: string;
}

/** Derive the risk signals from file evidence (pure; also reused by why-not). */
export function riskSignals(evidence: FileEvidence): Signal[] {
  const signals: Signal[] = [];
  const mem = evidence.memory;

  const failures = mem.filter((m) => m.kind === "failed_approach" || (m.kind === "decision" && (m.status === "superseded" || m.status === "rejected")));
  if (failures.length > 0) {
    signals.push({
      code: "prior-failures",
      detail: `${failures.length} previous failed/superseded approach(es) in this file's sessions`,
      weight: Math.min(40, failures.length * 14),
      provenance: memProvenance(failures),
    });
  }

  const decisions = mem.filter((m) => m.kind === "decision" && m.status === "active");
  const constraints = mem.filter((m) => m.kind === "constraint" && m.status !== "rejected");
  const architectural = decisions.length + constraints.length;
  if (architectural > 0) {
    signals.push({
      code: "active-decision",
      detail: `${architectural} active architectural decision(s)/constraint(s) recorded for this file`,
      weight: Math.min(30, architectural * 10),
      provenance: memProvenance([...decisions, ...constraints]),
    });
  }

  const issues = mem.filter((m) => m.kind === "known_issue" && m.status !== "resolved");
  if (issues.length > 0) {
    signals.push({
      code: "known-issues",
      detail: `${issues.length} unresolved known issue(s) touch this file`,
      weight: Math.min(30, issues.length * 12),
      provenance: memProvenance(issues),
    });
  }

  if (evidence.shapingPrompts >= 10) {
    signals.push({ code: "high-change-frequency", detail: `changed across ${evidence.shapingPrompts} captured prompts (high frequency)`, weight: 12, provenance: [] });
  } else if (evidence.shapingPrompts >= 4) {
    signals.push({ code: "change-frequency", detail: `changed across ${evidence.shapingPrompts} captured prompts`, weight: 6, provenance: [] });
  }

  if (evidence.churn >= 400) {
    signals.push({ code: "high-churn", detail: `${evidence.churn} lines changed over its history (high churn)`, weight: 12, provenance: [] });
  } else if (evidence.churn >= 100) {
    signals.push({ code: "churn", detail: `${evidence.churn} lines changed over its history`, weight: 6, provenance: [] });
  }

  return signals;
}

/** Explainable risk score for a file. */
export async function fileRisk(
  chronicleDir: string,
  log: EventLog,
  repoRoot: string,
  file: string,
): Promise<RiskResult> {
  const evidence = await collectFileEvidence(chronicleDir, log, repoRoot, file);
  const signals = riskSignals(evidence);
  const score = scoreOf(signals);
  const level = levelOf(score);
  const note =
    evidence.shapingPrompts === 0
      ? "No captured history for this file yet — risk is unknown, not zero."
      : "Score is the sum of the signals below; each traces to captured history. It flags where to look, not a certainty.";
  return { file, score, level, signals, note };
}
