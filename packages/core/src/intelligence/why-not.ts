/**
 * "Why not?" (docs/negative-knowledge.md) — Chronicle's signature negative-
 * knowledge feature. `chronicle why` says what shaped a file; `why-not` says
 * what should NOT be changed, and why: the intentional decisions, the
 * constraints, and the approaches the team already tried and rejected.
 *
 * Negative knowledge — "things we learned NOT to do" — is normally lost the
 * moment a chat window closes. Chronicle preserves it, with provenance.
 */
import type { EventLog } from "../store/event-log.js";
import { fileRisk } from "./risk.js";
import { collectFileEvidence, type Provenance } from "./signals.js";

export interface WhyNotReason {
  kind: "decision" | "constraint" | "failed_approach" | "known_issue";
  text: string;
  provenance: Provenance[];
}

export interface WhyNot {
  file: string;
  reasons: WhyNotReason[];
  riskLevel: "low" | "medium" | "high";
  empty: boolean;
}

export async function whyNot(
  chronicleDir: string,
  log: EventLog,
  repoRoot: string,
  file: string,
): Promise<WhyNot> {
  const evidence = await collectFileEvidence(chronicleDir, log, repoRoot, file);
  const risk = await fileRisk(chronicleDir, log, repoRoot, file);
  const reasons: WhyNotReason[] = [];

  const push = (m: (typeof evidence.memory)[number], kind: WhyNotReason["kind"], prefix: string): void => {
    reasons.push({ kind, text: `${prefix} ${m.content}`, provenance: m.sourceRefs.slice(0, 1) });
  };

  for (const m of evidence.memory) {
    if (m.kind === "decision" && m.status === "active") {
      push(m, "decision", "This was an intentional decision — changing it may violate the design:");
    } else if (m.kind === "constraint" && m.status !== "rejected") {
      push(m, "constraint", "A constraint applies here:");
    } else if (m.kind === "failed_approach" || (m.kind === "decision" && (m.status === "superseded" || m.status === "rejected"))) {
      push(m, "failed_approach", "Already tried and rejected — do NOT reintroduce:");
    } else if (m.kind === "known_issue" && m.status !== "resolved") {
      push(m, "known_issue", "There is an unresolved issue in this area:");
    }
  }

  // Deterministic order: decisions, constraints, failed approaches, issues.
  const rank: Record<WhyNotReason["kind"], number> = { decision: 0, constraint: 1, failed_approach: 2, known_issue: 3 };
  reasons.sort((a, b) => rank[a.kind] - rank[b.kind]);

  return { file, reasons, riskLevel: risk.level, empty: reasons.length === 0 };
}
