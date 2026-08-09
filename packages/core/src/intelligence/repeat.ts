/**
 * Repeated-mistake detection (docs/development-intelligence.md §4). If the same
 * problem shows up across multiple sessions with no resolution, that's a signal
 * worth surfacing BEFORE another attempt. Deterministic: it groups problem-
 * phrased prompts by their normalized subject; it does not use an LLM.
 *
 * Honest scope: it detects problems phrased similarly ("fix the auth race
 * condition" three times), not arbitrary paraphrases. Findings are "detected",
 * with provenance — never a claim about the cause.
 */
import type { EventLog } from "../store/event-log.js";
import { resolveEventText } from "../knowledge/knowledge.js";
import type { Provenance } from "./signals.js";

const PROBLEM = /\b(?:fix|bug|broken|failing|fails|still|again|race condition|deadlock|regression|not working|doesn'?t work|crash(?:es|ing)?|error|flaky|stuck)\b/i;
const RESOLUTION = /\b(?:fixed|resolved|works now|working now|done|passing|completed|shipped|merged)\b/i;

const STOP = new Set([
  "the", "a", "an", "for", "to", "of", "in", "on", "and", "or", "we", "i", "is",
  "it", "this", "that", "still", "again", "fix", "fixing", "bug", "issue", "please",
  "can", "you", "get", "getting", "see", "seeing", "why", "not", "working", "work",
  "error", "errors", "failing", "fails", "make", "let", "lets", "now", "with",
]);

/** Significant, stemmed keywords of a problem line — its subject. */
function keywords(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s/._-]/gu, " ")
        .split(/\s+/u)
        .map((w) => w.replace(/s$/u, ""))
        .filter((w) => w.length >= 4 && !STOP.has(w)),
    ),
  ].sort();
}

export interface RepeatedProblem {
  /** The recurring subject (its keyword phrase). */
  subject: string;
  occurrences: number;
  /** Distinct sessions it appeared in. */
  sessions: string[];
  firstTs: string;
  lastTs: string;
  files: string[];
  /** A resolution signal for the same subject appeared after the last occurrence. */
  resolved: boolean;
  provenance: Provenance[];
}

export interface RepeatOptions {
  /** Only problems whose related files include this path fragment. */
  file?: string;
  /** Only problems whose subject overlaps these task keywords. */
  task?: string;
  /** Only occurrences at/after this ISO timestamp. */
  since?: string;
}

interface Occurrence {
  key: string;
  words: string[];
  session: string | null;
  event: string;
  ts: string;
  files: string[];
}

export async function repeatedProblems(
  chronicleDir: string,
  log: EventLog,
  options: RepeatOptions = {},
): Promise<RepeatedProblem[]> {
  const problems: Occurrence[] = [];
  const resolutions: Array<{ key: string; words: string[]; ts: string }> = [];

  for await (const scanned of log.scan({ visibility: "all" })) {
    const event = scanned.event;
    if (event.type !== "PromptSubmitted" && event.type !== "PromptEdited") continue;
    if (options.since !== undefined && event.ts < options.since) continue;
    const body = await resolveEventText(chronicleDir, scanned);
    if (body === null) continue;
    const dirty = (event.git as { dirty?: string[] } | undefined)?.dirty ?? [];
    for (const raw of body.split("\n")) {
      const line = raw.trim();
      if (line.length < 6) continue;
      if (RESOLUTION.test(line)) {
        const words = keywords(line);
        if (words.length >= 2) resolutions.push({ key: words.join("|"), words, ts: event.ts });
      }
      if (!PROBLEM.test(line)) continue;
      const words = keywords(line);
      if (words.length < 2) continue; // need a real subject, not just "fix it"
      problems.push({ key: words.join("|"), words, session: event.session ?? null, event: event.id, ts: event.ts, files: dirty });
    }
  }

  // Group problem occurrences by exact subject key.
  const groups = new Map<string, Occurrence[]>();
  for (const occ of problems) {
    const list = groups.get(occ.key) ?? [];
    list.push(occ);
    groups.set(occ.key, list);
  }

  const results: RepeatedProblem[] = [];
  for (const [key, occs] of groups) {
    const sessions = [...new Set(occs.map((o) => o.session).filter((s): s is string => s !== null))];
    // "Repeated" = appears in ≥2 distinct sessions (a single session iterating is not a repeat).
    if (sessions.length < 2) continue;
    const words = occs[0]?.words ?? [];
    const sorted = [...occs].sort((a, b) => a.ts.localeCompare(b.ts));
    const firstTs = sorted[0]?.ts ?? "";
    const lastTs = sorted[sorted.length - 1]?.ts ?? "";
    const files = [...new Set(occs.flatMap((o) => o.files))].filter((f) => !f.startsWith(".chronicle/")).sort();
    // Resolved if a resolution sharing ≥2 keywords landed after the last occurrence.
    const resolved = resolutions.some(
      (r) => r.ts > lastTs && r.words.filter((w) => words.includes(w)).length >= 2,
    );

    if (options.file !== undefined && !files.some((f) => f.includes(options.file as string))) continue;
    if (options.task !== undefined) {
      const taskWords = new Set(keywords(options.task));
      if (!words.some((w) => taskWords.has(w))) continue;
    }

    results.push({
      subject: key.replace(/\|/gu, " "),
      occurrences: occs.length,
      sessions,
      firstTs,
      lastTs,
      files,
      resolved,
      provenance: occs.slice(0, 4).map((o) => ({ session: o.session, event: o.event })),
    });
  }

  // Most-repeated, still-unresolved first.
  return results.sort(
    (a, b) => Number(a.resolved) - Number(b.resolved) || b.occurrences - a.occurrences || b.lastTs.localeCompare(a.lastTs),
  );
}
