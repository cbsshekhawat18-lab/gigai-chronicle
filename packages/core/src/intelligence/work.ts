/**
 * Unfinished-work + stall detection (docs/development-intelligence.md §8, §13).
 * Surfaces work that looks started-but-not-done and tasks that appear stuck.
 * Confidence is always labeled — "likely / possibly / confirmed", never a bare
 * claim of completion or failure.
 */
import type { EventLog } from "../store/event-log.js";
import { repeatedProblems } from "./repeat.js";
import { keywords, loadMemory, type Provenance } from "./signals.js";

export interface UnfinishedItem {
  what: string;
  kind: "current_work" | "todo" | "known_issue";
  confidence: "possibly" | "likely" | "confirmed";
  lastActivity: string;
  provenance: Provenance[];
}

/** Work items with no resolution evidence — likely still open. */
export async function unfinishedWork(
  chronicleDir: string,
  log: EventLog,
  options: { now?: string } = {},
): Promise<UnfinishedItem[]> {
  const now = Date.parse(options.now ?? new Date().toISOString());
  const memory = await loadMemory(chronicleDir, log);
  const completedSubjects = memory
    .filter((m) => m.kind === "completed_work" || m.status === "resolved")
    .map((m) => new Set(keywords(m.content)));

  const open = memory.filter(
    (m) =>
      (m.kind === "current_work" || m.kind === "todo" || m.kind === "known_issue") &&
      m.status !== "resolved" &&
      m.status !== "rejected",
  );

  const items: UnfinishedItem[] = [];
  for (const m of open) {
    const kw = new Set(keywords(m.content));
    const resolved = completedSubjects.some((c) => [...kw].filter((k) => c.has(k)).length >= 2);
    if (resolved) continue;
    const days = Number.isNaN(Date.parse(m.updatedAt)) ? 999 : (now - Date.parse(m.updatedAt)) / 86_400_000;
    // Recent + explicit work = likely; a known issue with no fix = confirmed-ish; old = possibly.
    const confidence: UnfinishedItem["confidence"] =
      m.kind === "known_issue" ? "likely" : days <= 14 ? "likely" : "possibly";
    items.push({
      what: m.content,
      kind: m.kind as UnfinishedItem["kind"],
      confidence,
      lastActivity: m.updatedAt,
      provenance: m.sourceRefs.slice(0, 1),
    });
  }
  return items.sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
}

export interface StuckItem {
  subject: string;
  sessions: number;
  attempts: number;
  firstTs: string;
  lastTs: string;
  files: string[];
  causes: string[];
  provenance: Provenance[];
}

/**
 * Tasks that appear STALLED: the same problem recurring across several sessions
 * with attempts but no successful resolution. Identifies the pattern, does not
 * invent an explanation.
 */
export async function stuckWork(chronicleDir: string, log: EventLog): Promise<StuckItem[]> {
  const problems = await repeatedProblems(chronicleDir, log);
  return problems
    .filter((p) => !p.resolved && (p.sessions.length >= 3 || p.occurrences >= 3))
    .map((p) => ({
      subject: p.subject,
      sessions: p.sessions.length,
      attempts: p.occurrences,
      firstTs: p.firstTs,
      lastTs: p.lastTs,
      files: p.files,
      causes: [
        `same problem re-stated across ${p.sessions.length} sessions`,
        "no successful-resolution signal detected",
        ...(p.files.length > 0 ? [`repeated changes around ${p.files.slice(0, 3).join(", ")}`] : []),
      ],
      provenance: p.provenance,
    }));
}
