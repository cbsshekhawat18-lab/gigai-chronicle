/**
 * The seam between the two prompt worlds (ADR-0014).
 *
 * Chronicle records every prompt you type (`PromptSubmitted` → the event
 * log) and separately keeps a curated, versioned library
 * (`.chronicle/prompts/` → ADR-0011). Until now nothing joined them: to put
 * a prompt that worked into the library you had to *retype it* — the exact
 * manual hoarding P1 describes ("that prompt worked — where is it now?").
 * These lookups let a captured prompt be promoted as-is, provenance and all.
 *
 * Deliberately EventLog-based, not index-based: the VS Code extension reads
 * the store over pure fs and never loads SQLite (ADR-0008), so an
 * index-backed lookup could not be shared with it.
 */
import path from "node:path";
import type { BlobRef } from "@gigaichronicle/schema";
import { readBlob } from "../store/blobs.js";
import { blobDirFor } from "../store/paths.js";
import type { EventLog, ScannedEvent } from "../store/event-log.js";

/** A prompt as captured, ready to be promoted into the library. */
export interface CapturedPrompt {
  eventId: string;
  session: string | null;
  ts: string;
  text: string;
}

const PROMPT_TYPES = new Set(["PromptSubmitted", "PromptEdited"]);

function isBlobRef(value: unknown): value is BlobRef {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { $blob?: unknown }).$blob === "string"
  );
}

/**
 * The prompt's text, resolving a spilled body if needed.
 *
 * `text` is `textOrBlobSchema`: a string, or a `{$blob}` ref once it passes
 * 64KB (§7.2 rule 5). A long, carefully-built prompt is exactly what a
 * library is for, so a spilled body is read rather than skipped. Null when
 * there is genuinely nothing to promote.
 */
async function resolveText(chronicleDir: string, scanned: ScannedEvent): Promise<string | null> {
  const text = (scanned.event.payload as Record<string, unknown>)["text"];
  if (typeof text === "string") return text.trim() === "" ? null : text;
  if (!isBlobRef(text)) return null;
  const streamFile = path.join(chronicleDir, ...scanned.file.split("/"));
  // A missing or corrupt sidecar must not break the picker — the prompt is
  // simply not promotable, and the store's integrity is doctor's job.
  const content = await readBlob(blobDirFor(streamFile), text).catch(() => null);
  return content === null || content.trim() === "" ? null : content;
}

function toCaptured(scanned: ScannedEvent, text: string): CapturedPrompt {
  return {
    eventId: scanned.event.id,
    session: scanned.event.session ?? null,
    ts: scanned.event.ts,
    text,
  };
}

/**
 * Every captured prompt, oldest first. Private sessions are included: this
 * runs locally for the person who wrote them, and promoting is a deliberate,
 * per-prompt act — the library file it produces is what the user then
 * chooses to commit.
 */
export async function capturedPrompts(
  chronicleDir: string,
  log: EventLog,
  options: { session?: string } = {},
): Promise<CapturedPrompt[]> {
  const found: CapturedPrompt[] = [];
  for await (const scanned of log.scan({ visibility: "all" })) {
    if (!PROMPT_TYPES.has(scanned.event.type)) continue;
    if (options.session !== undefined && scanned.event.session !== options.session) continue;
    const text = await resolveText(chronicleDir, scanned);
    if (text === null) continue;
    found.push(toCaptured(scanned, text));
  }
  // Scan order is per-stream-file (each session's file, path-sorted), NOT
  // global time — so an interleaved or resumed session buries its newest
  // prompt mid-array. Sort by ts so callers that take the tail ("the last
  // prompt you typed", `chronicle diff` with no args, --from-last) get the
  // genuinely most-recent one.
  found.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  return found;
}

/** One captured prompt by event id; null when unknown or text-free. */
export async function capturedPromptByEvent(
  chronicleDir: string,
  log: EventLog,
  eventId: string,
): Promise<CapturedPrompt | null> {
  for await (const scanned of log.scan({ visibility: "all" })) {
    if (scanned.event.id !== eventId) continue;
    const text = await resolveText(chronicleDir, scanned);
    return text === null ? null : toCaptured(scanned, text);
  }
  return null;
}

/**
 * The most recently captured prompt — the whole point of the seam: "save the
 * one I just typed". Scoped to a session when given.
 */
export async function lastCapturedPrompt(
  chronicleDir: string,
  log: EventLog,
  options: { session?: string } = {},
): Promise<CapturedPrompt | null> {
  const all = await capturedPrompts(chronicleDir, log, options);
  return all[all.length - 1] ?? null;
}

/**
 * A kebab-case slug suggestion from prompt text — a starting point the user
 * edits, never an identity. Empty string when nothing usable survives.
 */
export function suggestSlug(text: string, maxWords = 6): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word !== "")
    .slice(0, maxWords)
    .join("-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 64)
    .replace(/-+$/, "");
}
