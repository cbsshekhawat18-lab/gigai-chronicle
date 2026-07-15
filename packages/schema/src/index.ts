/**
 * @gigaichronicle/schema — Chronicle Spec v1 artifacts: the ChronicleEvent
 * envelope, the core event taxonomy, prefixed-ULID identifiers, and the
 * `.chronicle/config.json` schema (ARCHITECTURE.md §5, §7; SPEC-ROADMAP.md).
 *
 * This package is THE contract: no runtime dependency beyond zod, no
 * Node-only APIs, nothing vendor-specific in schema structure.
 */

// IDs
export {
  ID_PREFIXES,
  ULID_REGEX,
  generateUlid,
  newId,
  isId,
  idPattern,
  idTime,
  type IdKind,
  type IdPrefix,
  type ChronicleId,
  type EventId,
  type SessionId,
  type ProjectId,
  type WorkspaceId,
  type RandomByteSource,
} from "./ids.js";

// Shared primitives
export {
  TIMESTAMP_REGEX,
  timestampSchema,
  GIT_SHA_REGEX,
  gitShaSchema,
  blobRefSchema,
  textOrBlobSchema,
  type BlobRef,
  type TextOrBlob,
} from "./shared.js";

// Envelope
export {
  ENVELOPE_VERSION,
  PAYLOAD_SCHEMA_REF_REGEX,
  actorKindSchema,
  actorSchema,
  gitStateSchema,
  visibilitySchema,
  metaSchema,
  envelopeSchema,
  type Actor,
  type GitState,
  type Visibility,
  type EventMeta,
  type Envelope,
} from "./envelope.js";

// Extension namespace
export { EXT_TYPE_REGEX, isExtEventType, parseExtEventType } from "./ext.js";

// Registry
export {
  CORE_EVENTS,
  CORE_EVENT_TYPES,
  RESERVED_EVENT_TYPES,
  isCoreEventType,
  type CoreEventType,
  type CoreEventDefinition,
  type SessionBinding,
  type PayloadOf,
} from "./registry.js";

// Parse API
export {
  parseChronicleEvent,
  parseChronicleEventLine,
  type ParseResult,
  type ParseFailureCode,
  type ChronicleEvent,
  type CoreChronicleEvent,
  type ExtChronicleEvent,
} from "./parse.js";

// Config
export {
  CONFIG_VERSION,
  configSchema,
  providerModeSchema,
  sessionVisibilityDefaultSchema,
  type ChronicleConfig,
} from "./config.js";

/** Canonical package name; kept in sync with package.json by test. */
export const PACKAGE_NAME = "@gigaichronicle/schema";
