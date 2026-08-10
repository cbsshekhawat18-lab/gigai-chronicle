/**
 * Development Intelligence — shared signals & evidence (docs/development-intelligence.md).
 *
 * The intelligence layer turns Chronicle's passive history into active insight:
 * risk, negative knowledge ("why-not"), repeated mistakes, impact, drift. It
 * CONSUMES the event history + Project Memory + git — it never replaces them.
 *
 * Two hard rules the whole layer obeys:
 *  1. EXPLAINABLE — every score is a sum of named Signals, each shown with its
 *     weight and provenance. There is no opaque number.
 *  2. NO FALSE CERTAINTY — findings are "detected / likely / possible", never
 *     "this will break". Deterministic and model-free; no network, no embeddings.
 */
import { changesByPrompt } from "../attribution/why.js";
import { buildMemory } from "../memory/engine.js";
import type { MemoryItem } from "../memory/schema.js";
import { listMemory } from "../memory/store.js";
import type { EventLog } from "../store/event-log.js";

export interface Provenance {
  session: string | null;
  event: string | null;
}

/** One explainable contribution to a score, with where it came from. */
export interface Signal {
  /** Stable slug, e.g. "prior-failures", "active-decision", "high-churn". */
  code: string;
  /** Human-readable explanation ("4 previous failed/superseded approaches"). */
  detail: string;
  /** Points contributed toward a 0–100 score. */
  weight: number;
  provenance: Provenance[];
}

/** The raw, deterministic evidence about one file — the input to risk/why-not. */
export interface FileEvidence {
  file: string;
  /** Count of captured prompt-turns that changed this file (attribution). */
  shapingPrompts: number;
  /** Distinct sessions that shaped it. */
  sessions: string[];
  /** Total lines changed across those turns (insertions + deletions). */
  churn: number;
  /** Project Memory items derived from the file's shaping sessions. */
  memory: MemoryItem[];
}

/** Load Project Memory (persisted store, else derived) — shared by the modules. */
export async function loadMemory(chronicleDir: string, log: EventLog): Promise<MemoryItem[]> {
  const stored = await listMemory(chronicleDir);
  return stored.length > 0 ? stored : (await buildMemory(chronicleDir, log)).items;
}

/**
 * Collect deterministic evidence about a file: which captured prompts changed
 * it, how much, in which sessions, and the Project Memory from those sessions.
 * Everything downstream (risk, why-not) is explained from this.
 */
export async function collectFileEvidence(
  chronicleDir: string,
  log: EventLog,
  repoRoot: string,
  file: string,
): Promise<FileEvidence> {
  const changes = await changesByPrompt(repoRoot, { path: file, limit: 500 });
  const wanted = new Set(changes.map((c) => c.eventId));

  // eventId → session for the shaping prompts (one scan, pure-fs).
  const eventSession = new Map<string, string | null>();
  if (wanted.size > 0) {
    for await (const { event } of log.scan({ visibility: "all" })) {
      if (wanted.has(event.id)) eventSession.set(event.id, event.session ?? null);
    }
  }

  const sessions = new Set<string>();
  let churn = 0;
  for (const c of changes) {
    const s = eventSession.get(c.eventId);
    if (s !== undefined && s !== null) sessions.add(s);
    for (const f of c.files) churn += (f.insertions ?? 0) + (f.deletions ?? 0);
  }

  const all = await loadMemory(chronicleDir, log);
  // Attribute memory to a file ONLY via precise file evidence (relatedFiles,
  // populated at rebuild from checkpoint attribution). We deliberately do NOT
  // fall back to session overlap: a decision made in a broad session that merely
  // touched this file is not "about" this file, and attributing it would inflate
  // risk (e.g. make a README look high-risk). No evidence → honestly no signal.
  const memory = all.filter((m) => m.relatedFiles.includes(file));

  return {
    file,
    shapingPrompts: changes.length,
    sessions: [...sessions].sort(),
    churn,
    memory,
  };
}

/** Map a raw 0–100 score to a confidence-labeled level. */
export function levelOf(score: number): "low" | "medium" | "high" {
  return score >= 67 ? "high" : score >= 34 ? "medium" : "low";
}

/** Sum signals into a capped 0–100 score. */
export function scoreOf(signals: Signal[]): number {
  return Math.max(0, Math.min(100, Math.round(signals.reduce((s, g) => s + g.weight, 0))));
}

/** Provenance of the first N memory items — for a signal's evidence trail. */
export function memProvenance(items: MemoryItem[], max = 4): Provenance[] {
  return items.slice(0, max).flatMap((m) => m.sourceRefs.slice(0, 1));
}

const STOPWORDS = new Set([
  "the", "a", "an", "for", "to", "of", "in", "on", "and", "or", "we", "use",
  "using", "with", "as", "is", "will", "be", "our", "this", "that", "it", "fix",
  "add", "implement", "make", "please", "can", "you", "i", "how", "do", "replace",
  "change", "switch", "update", "from", "into", "new", "old", "all", "some",
]);

/** Significant, stemmed keywords of a phrase — shared by scope/preflight/task matching. */
export function keywords(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s/._-]/gu, " ")
        .split(/\s+/u)
        .map((w) => w.replace(/s$/u, ""))
        .filter((w) => w.length >= 3 && !STOPWORDS.has(w)),
    ),
  ];
}
