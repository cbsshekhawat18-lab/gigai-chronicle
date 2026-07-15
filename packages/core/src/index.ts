/**
 * @gigaichronicle/core — Chronicle engine: Chronicle Store (M3), Event
 * Engine (M5), Replay Engine (M8), correlation (M9), query API (M4)
 * (ARCHITECTURE.md §8–§11). Node-only by design (§12).
 */

// Errors (§13 — typed codes, stable API)
export { ChronicleError, isChronicleError, type ChronicleErrorCode } from "./errors.js";

// Chronicle Store layer 1 — the EventLog (M3)
export {
  EventLog,
  type EventLogOptions,
  type ScanRange,
  type ScannedEvent,
  type VerifyReport,
} from "./store/event-log.js";
export {
  streamForEvent,
  sessionStreamRef,
  absoluteStreamPath,
  blobDirFor,
  type StreamRef,
} from "./store/paths.js";
export { SPILL_THRESHOLD_BYTES, readBlob, blobFileName } from "./store/blobs.js";
export { GENERATED_MARKER, withGeneratedMarker, isGeneratedContent } from "./store/generated.js";

/** Canonical package name; kept in sync with package.json by test. */
export const PACKAGE_NAME = "@gigaichronicle/core";
