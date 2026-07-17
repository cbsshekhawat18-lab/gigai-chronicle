/**
 * Consent gate 1 — the high-sensitivity capture mode (PHASE-0 §14, ADR-0015).
 *
 * `capture.mode: "metadata"` promises "event shapes/timings but no prompt
 * text" (config schema §7.3). It is the FIRST consent gate in the product
 * and the reason the regulated persona adopts at all — so it is enforced at
 * the one choke point every write passes through (the Event Engine's REDACT
 * stage), never by asking callers to pass a flag.
 *
 * That distinction is the whole lesson of ADR-0015: the mode was inert for
 * exactly as long as honoring it was somebody else's job.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

export type CaptureMode = "full" | "metadata";

/** Stands in for a text body the user asked never to store. */
export const METADATA_ONLY_MARKER = "[METADATA-ONLY]";

/**
 * The configured capture mode. "full" when absent — the schema's documented
 * default.
 *
 * Read tolerantly and on purpose: a config too broken for full schema
 * validation must still be able to say "metadata". Failing open on a
 * privacy gate because of an unrelated field would repeat this bug in a new
 * costume. A config that cannot be read at all is `doctor`'s problem, and
 * yields "full" so ordinary capture never silently stops.
 */
export async function captureModeOf(chronicleDir: string): Promise<CaptureMode> {
  const raw = await readFile(path.join(chronicleDir, "config.json"), "utf8").catch(() => null);
  if (raw === null) return "full";
  try {
    const parsed = JSON.parse(raw) as { capture?: { mode?: unknown } };
    return parsed.capture?.mode === "metadata" ? "metadata" : "full";
  } catch {
    return "full";
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Replace a payload's text body with the marker — shapes in, content out.
 *
 * `text` is the field the schema types as a text body (`textOrBlobSchema`:
 * PromptSubmitted, PromptEdited, AIResponseReceived), and "no prompt text"
 * is exactly what the mode promises. Everything else — type, timings, model,
 * tool names, git context — is shape and stays, because that is what the
 * mode is FOR: an audit trail without the words.
 *
 * Deliberately not a hash: a hash of a short prompt is a dictionary attack
 * away from the prompt, which would leak the very thing being protected.
 */
export function stripTextBodies(payload: unknown): unknown {
  if (!isPlainObject(payload)) return payload;
  if (!("text" in payload)) return payload;
  return { ...payload, text: METADATA_ONLY_MARKER };
}
