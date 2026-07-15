/**
 * Typed errors — ARCHITECTURE.md §13: surfaces map codes to UX, never
 * strings. Codes are stable API; messages are not.
 */

export type ChronicleErrorCode =
  | "E_NOT_INITIALIZED" // no chronicle store where one was expected
  | "E_LOCKED" //          another live process holds the stream lock
  | "E_INVALID_EVENT" //   caller tried to append data that fails the spec
  | "E_SCHEMA_AHEAD"; //   data written by a newer chronicle

export class ChronicleError extends Error {
  override readonly name = "ChronicleError";

  constructor(
    readonly code: ChronicleErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** Narrowing helper for catch blocks. */
export function isChronicleError(
  value: unknown,
  code?: ChronicleErrorCode,
): value is ChronicleError {
  return value instanceof ChronicleError && (code === undefined || value.code === code);
}
