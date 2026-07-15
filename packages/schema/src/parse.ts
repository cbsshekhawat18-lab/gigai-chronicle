/**
 * The parse API — validation with the read-forward rule (ARCHITECTURE.md §22).
 *
 * Result-style, never throwing on data: stored events are user data and bad
 * data is an expected condition, not an exception. Three failure codes with
 * distinct meanings:
 *
 *   - SCHEMA_AHEAD:  written by a newer Chronicle (`v` > known, or a core
 *                    payload version > known). "Please upgrade" — never a
 *                    crash, never silent data loss.
 *   - UNKNOWN_TYPE:  a type this spec version doesn't define (including the
 *                    reserved Phase 2–3 names).
 *   - INVALID:       structurally broken data.
 *
 * Unknown *fields* anywhere in a known structure are NOT errors — they pass
 * through parsing intact (forward compatibility).
 */
import { ENVELOPE_VERSION, envelopeSchema, type Envelope } from "./envelope.js";
import { isExtEventType } from "./ext.js";
import { CORE_EVENTS, isCoreEventType, type CoreEventType, type PayloadOf } from "./registry.js";

/** A validated core event, payload narrowed by its type. */
export type CoreChronicleEvent<T extends CoreEventType = CoreEventType> = Envelope & {
  type: T;
  payload: PayloadOf<T>;
};

/** A validated extension event — envelope-checked, payload opaque (§5.3). */
export type ExtChronicleEvent = Envelope & { payload: unknown };

export type ChronicleEvent = CoreChronicleEvent | ExtChronicleEvent;

export type ParseFailureCode = "SCHEMA_AHEAD" | "UNKNOWN_TYPE" | "INVALID";

export type ParseResult =
  | { ok: true; event: ChronicleEvent; kind: "core" | "ext" }
  | { ok: false; code: ParseFailureCode; message: string };

const PAYLOAD_REF_SPLIT = /^(.+)\/([1-9][0-9]*)$/;

/** Validate one decoded JSONL value as a ChronicleEvent. */
export function parseChronicleEvent(value: unknown): ParseResult {
  // Read-forward gate first: a newer envelope must not be reported as
  // "invalid" — it is valid data we are too old to understand.
  if (typeof value === "object" && value !== null && "v" in value) {
    const v = (value as { v: unknown }).v;
    if (typeof v === "number" && Number.isInteger(v) && v > ENVELOPE_VERSION) {
      return {
        ok: false,
        code: "SCHEMA_AHEAD",
        message: `envelope v${v} is newer than supported v${ENVELOPE_VERSION} — upgrade chronicle`,
      };
    }
  }

  const envelope = envelopeSchema.safeParse(value);
  if (!envelope.success) {
    return { ok: false, code: "INVALID", message: formatIssues(envelope.error.issues) };
  }
  const event = envelope.data;

  if (isExtEventType(event.type)) {
    // Extension payloads are opaque at the spec layer (validated by the
    // registering provider at capture time, M7).
    return { ok: true, event: event as ExtChronicleEvent, kind: "ext" };
  }

  if (!isCoreEventType(event.type)) {
    return { ok: false, code: "UNKNOWN_TYPE", message: `unknown event type "${event.type}"` };
  }
  const definition = CORE_EVENTS[event.type];

  // Session binding per registry declaration.
  if (definition.sessionBinding === "required" && event.session === undefined) {
    return { ok: false, code: "INVALID", message: `${event.type} requires a session` };
  }
  if (definition.sessionBinding === "none" && event.session !== undefined) {
    return { ok: false, code: "INVALID", message: `${event.type} is project-scoped; session must be absent` };
  }

  // meta.schema must reference this type; a payload version above the known
  // one is tolerated-forward: envelope + additive fields still read (§22),
  // payload validation is skipped rather than wrongly failed.
  const ref = PAYLOAD_REF_SPLIT.exec(event.meta.schema);
  if (ref === null || ref[1] !== event.type) {
    return {
      ok: false,
      code: "INVALID",
      message: `meta.schema "${event.meta.schema}" does not reference type "${event.type}"`,
    };
  }
  const payloadVersion = Number(ref[2]);
  if (payloadVersion > definition.payloadVersion) {
    return { ok: true, event: event as CoreChronicleEvent, kind: "core" };
  }

  const payload = definition.payload.safeParse(event.payload);
  if (!payload.success) {
    return {
      ok: false,
      code: "INVALID",
      message: `${event.type} payload: ${formatIssues(payload.error.issues)}`,
    };
  }

  return {
    ok: true,
    event: { ...event, payload: payload.data } as CoreChronicleEvent,
    kind: "core",
  };
}

/** Parse one JSONL line (JSON decode + event validation). */
export function parseChronicleEventLine(line: string): ParseResult {
  let decoded: unknown;
  try {
    decoded = JSON.parse(line);
  } catch (error) {
    return { ok: false, code: "INVALID", message: `not valid JSON: ${(error as Error).message}` };
  }
  return parseChronicleEvent(decoded);
}

function formatIssues(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): string {
  return issues
    .slice(0, 5)
    .map((issue) => (issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message))
    .join("; ");
}
