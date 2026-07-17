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

// Chronicle Store layer 2 — the index (M4)
export {
  ChronicleIndex,
  type TimelineQuery,
  type SessionSummary,
  type SearchHit,
  type CorrelatedLink,
  type IndexFreshness,
} from "./index-db/chronicle-index.js";
export { INDEX_SCHEMA_VERSION } from "./index-db/ddl.js";

// Doctor — the trust anchor (M4)
export { runDoctor, type DoctorReport, type DoctorOptions, type SecretFinding } from "./doctor.js";
export { SECRET_PATTERNS, detectSecretKinds, type SecretPattern } from "./redaction/patterns.js";

// Event Engine (M5) — apps import from the root; PROVIDERS import the
// "./emit" subpath only (boundary lint).
export {
  EventEngine,
  MAX_CANDIDATE_BYTES,
  type RawCandidate,
  type EmitResult,
  type ProviderIdentity,
  type EventEngineOptions,
} from "./engine/event-engine.js";
export { createGitReader, fixedGitReader, type GitReader } from "./git/git-reader.js";
export { createRedactor, marker, type Redactor } from "./redaction/redact.js";
export { harvestEnvValues } from "./redaction/env-harvest.js";
export { findEntropyTokens, looksLikeSecretToken, shannonEntropy } from "./redaction/entropy.js";

// Replay Engine (M8) — the capability; timeline and digests are renderings
export {
  replaySession,
  reduceFrame,
  frameAt,
  type ReplayFrame,
  type Turn,
  type FileState,
  type ToolRun,
  type GitContext,
  type CaptureGapRef,
  type Fidelity,
} from "./replay/frames.js";
export {
  renderSessionDigest,
  generateSessionDigests,
  sessionEvents,
  type DigestReport,
} from "./replay/digest.js";

// Correlation (M9) — links are derived edges; the trailer is the one git write
export {
  recomputeLinks,
  type LinkRow,
  type CorrelationReport,
} from "./correlation/links.js";
export {
  installTrailerHook,
  uninstallTrailerHook,
  hooksDirFor,
} from "./correlation/trailer-hook.js";

// Git-native code checkpoints + explicit restore (ADR-0012)
export {
  createCheckpoint,
  checkpointFor,
  listCheckpointedEvents,
  listCheckpoints,
  restorePreview,
  restoreCheckpoint,
  type CheckpointRef,
  type RestoreResult,
} from "./checkpoints/checkpoints.js";

// Intent attribution — what was ASKED that made this code (ADR-0013).
// Derived from checkpoints on demand; nothing new is stored.
export {
  changesByPrompt,
  parseNumstat,
  type ChangesByPromptOptions,
  type FileChange,
  type PromptChange,
} from "./attribution/why.js";

// Prompt library — version control for prompts (§5.4, ADR-0011)
export {
  savePrompt,
  getPrompt,
  listPrompts,
  promptVersions,
  promptHistory,
  parsePrompt,
  type Prompt,
  type PromptMeta,
  type PromptVersionNode,
  type SavePromptOptions,
} from "./prompts/prompts.js";
export { unifiedDiff } from "./prompts/diff.js";

// Identity model + init (M6)
export {
  computeRepositoryFingerprint,
  digestFingerprint,
  isForeignRepository,
  normalizeRemoteUrl,
  type RepositoryFingerprint,
} from "./identity/fingerprint.js";
export {
  loadOrCreateMachineState,
  saveMachineState,
  machineFilePath,
  utcDay,
  type MachineState,
} from "./identity/machine.js";
export { openWorkspace, type WorkspaceContext } from "./identity/open-workspace.js";
export { runInit, type InitOptions, type InitResult } from "./init/init.js";
export { detectProviders, type ProviderMode } from "./init/detect-providers.js";
export { isGitRepository } from "./git/git-info.js";

/** Canonical package name; kept in sync with package.json by test. */
export const PACKAGE_NAME = "@gigaichronicle/core";
