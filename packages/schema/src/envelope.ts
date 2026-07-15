/**
 * The ChronicleEvent envelope — ARCHITECTURE.md §5.2, Chronicle Spec v1.
 *
 * One envelope for every event, from every provider, in every phase.
 * Phases 2–4 add event types; they never change the envelope.
 *
 * Forward compatibility (§22 read-forward rule): every object schema uses
 * `.catchall(z.unknown())`, so documents written by a *newer* minor revision
 * validate here and unknown fields survive parse → serialize. Rejection is
 * reserved for `v` greater than {@link ENVELOPE_VERSION} — that is
 * `SCHEMA_AHEAD`, a distinct outcome from invalid data (see parse.ts).
 */
import { z } from "zod";
import { idPattern } from "./ids.js";
import { timestampSchema, gitShaSchema } from "./shared.js";

/** Envelope schema version this package understands. */
export const ENVELOPE_VERSION = 1;

/** Who caused the moment: a human, the AI tool/agent, or Chronicle itself. */
export const actorKindSchema = z.enum(["human", "agent", "system"]);

export const actorSchema = z
  .object({
    kind: actorKindSchema,
    /** Provider id that observed the moment (e.g. "example-tool"). Provenance, never dispatch. */
    provider: z.string().min(1).optional(),
    /** Model identifier when known (e.g. "example-model-1"). */
    model: z.string().min(1).optional(),
  })
  .catchall(z.unknown());

/** Snapshot of repo state at event time — powers correlation (§11). */
export const gitStateSchema = z
  .object({
    /** HEAD sha; null on an unborn branch (fresh repo before first commit). */
    head: gitShaSchema.nullable(),
    /** Current branch; null when detached. */
    branch: z.string().min(1).nullable(),
    /** Changed paths at event time (git status), possibly empty. */
    dirty: z.array(z.string().min(1)),
  })
  .catchall(z.unknown());

/** `shared` = committed journey record; `local` = machine-local ops stream (§5.4). */
export const visibilitySchema = z.enum(["shared", "local"]);

/** `meta.schema` form: `<TypeName>/<payloadVersion>`, e.g. `PromptSubmitted/1`. */
export const PAYLOAD_SCHEMA_REF_REGEX = /^[A-Za-z][A-Za-z0-9.-]*\/[1-9][0-9]*$/;

export const metaSchema = z
  .object({
    /** Capturing provider with version, e.g. "example-tool@1.0.0". */
    provider: z.string().min(1),
    /** Workspace (clone) that recorded the event. */
    workspace: z.string().regex(new RegExp(idPattern("workspace"))),
    /** Payload schema name/version reference. */
    schema: z.string().regex(PAYLOAD_SCHEMA_REF_REGEX),
    visibility: visibilitySchema,
  })
  .catchall(z.unknown());

/**
 * The envelope with an untyped payload. Payload typing per event type is
 * layered on by the registry (registry.ts) and the parse API (parse.ts).
 */
export const envelopeSchema = z
  .object({
    v: z.number().int().min(1),
    id: z.string().regex(new RegExp(idPattern("event"))),
    ts: timestampSchema,
    /** PascalCase core type or `Ext.<providerId>.<Name>` (ext.ts). */
    type: z.string().min(1),
    /**
     * Owning session. Required for session-scoped events, optional for
     * ambient events (git moments can happen outside any session), and
     * absent for project-scoped events — enforced per type in parse.ts
     * using the registry's session-binding declaration.
     */
    session: z
      .string()
      .regex(new RegExp(idPattern("session")))
      .optional(),
    actor: actorSchema,
    git: gitStateSchema,
    payload: z.unknown(),
    meta: metaSchema,
  })
  .catchall(z.unknown());

export type Actor = z.infer<typeof actorSchema>;
export type GitState = z.infer<typeof gitStateSchema>;
export type Visibility = z.infer<typeof visibilitySchema>;
export type EventMeta = z.infer<typeof metaSchema>;

/** A structurally valid envelope whose payload is not yet type-narrowed. */
export type Envelope = z.infer<typeof envelopeSchema>;
