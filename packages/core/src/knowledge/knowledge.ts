/**
 * Knowledge extraction (roadmap "Knowledge") — the decisions and TODOs buried
 * in the sessions you already captured, surfaced with their provenance.
 *
 * Rule-based and DERIVED, never stored: patterns match the actual text of your
 * prompts and the agent's responses. The product law that makes it honest —
 * every item carries its source line (whitespace-normalized and length-capped,
 * but never reworded), so you read what you wrote, never a paraphrase a model
 * might get wrong, plus a confidence tier so a fuzzy match reads as fuzzy.
 * Negated and interrogative lines are guarded out, so "not going with Redis" is
 * never surfaced as a decision to use it. It calls no model; the extractor is a
 * set of regexes, and you can see every one.
 *
 * Honest limit: "did we decide something" is genuinely ambiguous, so this
 * finds high-signal phrasings ("let's use X", "TODO", "instead of Y") — it is
 * a good index into the record, not a claim to have understood it.
 */
import path from "node:path";
import type { BlobRef } from "@gigaichronicle/schema";
import { readBlob } from "../store/blobs.js";
import { blobDirFor } from "../store/paths.js";
import type { EventLog, ScannedEvent } from "../store/event-log.js";

export type KnowledgeKind = "decision" | "todo";

/** One surfaced piece of knowledge, with where it came from. */
export interface KnowledgeItem {
  kind: KnowledgeKind;
  /** The source line the pattern matched — whitespace-normalized and capped at
   *  200 chars, but never reworded (you read what you actually wrote). */
  text: string;
  eventId: string;
  session: string | null;
  ts: string;
  /** Who said it: a prompt you typed, or the agent's response. */
  role: "human" | "agent";
  confidence: "high" | "medium";
}

export interface KnowledgeOptions {
  /** Only this session. */
  session?: string;
  /** Only these sessions (scopes the SCAN, so dedup stays within scope — an
   *  identical line in an out-of-scope session cannot suppress an in-scope one). */
  sessions?: readonly string[];
  /** Only "decision" or "todo". */
  kind?: KnowledgeKind;
}

const TEXT_TYPES = new Set(["PromptSubmitted", "PromptEdited", "AIResponseReceived"]);

/**
 * Ordered rules: the first match on a line wins, so a strong signal beats a
 * weak one. Ordered by CONFIDENCE first (all high before all medium), so a line
 * carrying both a high and a medium signal — "The plan is to add a TODO" — is
 * classified by the stronger one (the TODO), never mislabeled as the weaker.
 *
 * `immune` marks rules whose phrasing IS the signal even amid a negation or a
 * question ("TODO:", "don't forget to"): the negation/question guard skips them,
 * so an authored marker is never dropped for containing the word "don't".
 */
const RULES: ReadonlyArray<{
  kind: KnowledgeKind;
  confidence: "high" | "medium";
  re: RegExp;
  immune?: true;
}> = [
  // --- high confidence -----------------------------------------------------
  // Decision verbs are deliberately narrow — "use/go with/switch to/adopt"
  // name a technical choice; weak verbs like "keep"/"drop" were dropped because
  // they fire on conversational lines ("I'll keep an eye on it").
  { kind: "decision", confidence: "high", re: /\bdecided to\b/i },
  { kind: "decision", confidence: "high", re: /\b(?:we(?:'ll| will| are going to)|let'?s|i(?:'ll| will))\s+(?:use|go with|switch to|adopt)\b/i },
  { kind: "decision", confidence: "high", re: /\bgoing with\b/i },
  { kind: "decision", confidence: "high", re: /\bchose\b[^.]{0,50}\bover\b/i },
  // Authored markers + unambiguous phrasings. "follow up"/"we need to" were
  // dropped — they fire on conversation ("I'll follow up automatically").
  { kind: "todo", confidence: "high", re: /\b(?:TODO|FIXME|XXX|HACK)\b/, immune: true },
  { kind: "todo", confidence: "high", re: /\b(?:next step|revisit later|don'?t forget|remember to)\b/i, immune: true },
  // --- medium confidence ---------------------------------------------------
  { kind: "decision", confidence: "medium", re: /\binstead of\b[^.]{0,50}\b(?:use|go with)\b/i },
  { kind: "decision", confidence: "medium", re: /\bthe (?:approach|plan|decision|design) (?:is|will be|was)\b/i },
  { kind: "todo", confidence: "medium", re: /\bwe should\b/i },
];

// A negation flips a signal's meaning ("not going with Redis", "haven't decided
// to"); a trailing "?" makes it a question, not a commitment. Both are guarded
// out for non-immune rules — we'd rather miss "decided to not use X" (a rare
// real decision) than assert its opposite. `n['’]t` catches don't/won't/isn't
// etc.; bare-word forms catch not/never/no longer/cannot.
const NEGATION = /\b(?:not|never|no longer|cannot)\b|n['’]t\b/i;

function isBlobRef(value: unknown): value is BlobRef {
  return typeof value === "object" && value !== null && typeof (value as { $blob?: unknown }).$blob === "string";
}

/** Resolve a text-or-blob payload field to a string; null when there's nothing
 *  usable. Exported so the Context Pack resolves blob-spilled prompts the same
 *  way (a >64KB prompt whose text is a blob ref must not read as "unavailable"). */
export async function resolveEventText(chronicleDir: string, scanned: ScannedEvent): Promise<string | null> {
  const text = (scanned.event.payload as Record<string, unknown>)["text"];
  if (typeof text === "string") return text.trim() === "" ? null : text;
  if (!isBlobRef(text)) return null;
  const streamFile = path.join(chronicleDir, ...scanned.file.split("/"));
  const content = await readBlob(blobDirFor(streamFile), text).catch(() => null);
  return content === null || content.trim() === "" ? null : content;
}

/** Trim a matched line to a readable, single-line snippet. */
function snippet(line: string, max = 200): string {
  const flat = line.replace(/\s+/gu, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * Extract decisions and TODOs across the captured record, oldest first. Scans
 * prompts (what you asked) and responses (what the agent said) — a decision
 * lives in either. Private sessions are included: this is a local read for the
 * person who owns them.
 */
export async function extractKnowledge(
  chronicleDir: string,
  log: EventLog,
  options: KnowledgeOptions = {},
): Promise<KnowledgeItem[]> {
  const items: KnowledgeItem[] = [];
  const seen = new Set<string>(); // dedup identical (kind|text) — repeats aren't new knowledge
  const only = options.sessions !== undefined ? new Set(options.sessions) : null;
  for await (const scanned of log.scan({ visibility: "all" })) {
    const event = scanned.event;
    if (!TEXT_TYPES.has(event.type)) continue;
    if (options.session !== undefined && event.session !== options.session) continue;
    if (only !== null && (event.session == null || !only.has(event.session))) continue;
    const body = await resolveEventText(chronicleDir, scanned);
    if (body === null) continue;
    const role: "human" | "agent" = event.type === "AIResponseReceived" ? "agent" : "human";

    for (const rawLine of body.split("\n")) {
      const line = rawLine.trim();
      if (line.length < 4) continue;
      const question = line.endsWith("?");
      const negated = NEGATION.test(line);
      for (const rule of RULES) {
        if (options.kind !== undefined && rule.kind !== options.kind) continue;
        // A negation or a question flips/voids the signal — skip, unless the
        // rule's phrasing is itself the marker (TODO:, don't forget to …).
        if ((question || negated) && rule.immune !== true) continue;
        if (!rule.re.test(line)) continue;
        // Dedup on the FULL normalized line, not the display snippet — two
        // distinct lines that share a 199-char prefix must stay distinct.
        const flat = line.replace(/\s+/gu, " ").trim();
        const key = `${rule.kind}|${flat.toLowerCase()}`;
        if (seen.has(key)) break;
        seen.add(key);
        items.push({
          kind: rule.kind,
          text: snippet(line),
          eventId: event.id,
          session: event.session ?? null,
          ts: event.ts,
          role,
          confidence: rule.confidence,
        });
        break; // one item per line — the first (strongest) rule wins
      }
    }
  }
  return items;
}
