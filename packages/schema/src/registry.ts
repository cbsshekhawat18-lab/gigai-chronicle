/**
 * The core event registry — ARCHITECTURE.md §5.3 as data.
 *
 * One entry per Phase-1 core type: payload schema, payload version, session
 * binding, and default visibility. The registry is the single source of
 * truth consumed by the parse API (parse.ts), the JSON Schema generator,
 * the fixture corpus, and — downstream — the Event Engine (M5).
 *
 * Session binding semantics (envelope.ts):
 *   - "required": the event only makes sense inside a session
 *   - "optional": ambient — may occur with or without an active session
 *   - "none":     project-scoped — a session reference is an error
 */
import type { z } from "zod";
import {
  projectCreatedPayload,
  projectOpenedPayload,
  sessionStartedPayload,
  sessionEndedPayload,
  workspaceMovedPayload,
} from "./events/lifecycle.js";
import {
  promptSubmittedPayload,
  promptEditedPayload,
  aiResponseReceivedPayload,
} from "./events/conversation.js";
import {
  toolExecutedPayload,
  fileModifiedPayload,
  filesAcceptedPayload,
  filesRejectedPayload,
} from "./events/actions.js";
import {
  gitCommitCreatedPayload,
  gitPushPayload,
  branchChangedPayload,
  gitTagCreatedPayload,
} from "./events/git.js";
import { linkConfirmedPayload, linkRejectedPayload } from "./events/links.js";
import { captureGapPayload, captureDegradedPayload } from "./events/honesty.js";
import type { Visibility } from "./envelope.js";

export type SessionBinding = "required" | "optional" | "none";

export interface CoreEventDefinition<S extends z.ZodType = z.ZodType> {
  /** Current payload schema version (meta.schema = `<Type>/<version>`). */
  readonly payloadVersion: number;
  readonly payload: S;
  readonly sessionBinding: SessionBinding;
  readonly defaultVisibility: Visibility;
}

/** Generic over the schema type so `PayloadOf<T>` keeps full inference. */
function define<S extends z.ZodType>(
  payload: S,
  sessionBinding: SessionBinding,
  defaultVisibility: Visibility = "shared",
): CoreEventDefinition<S> {
  return { payloadVersion: 1, payload, sessionBinding, defaultVisibility };
}

/** All Phase-1 core event types (ARCHITECTURE.md §5.3). */
export const CORE_EVENTS = {
  // Lifecycle
  ProjectCreated: define(projectCreatedPayload, "none"),
  ProjectOpened: define(projectOpenedPayload, "none", "local"),
  SessionStarted: define(sessionStartedPayload, "required"),
  SessionEnded: define(sessionEndedPayload, "required"),
  WorkspaceMoved: define(workspaceMovedPayload, "none", "local"),
  // Conversation
  PromptSubmitted: define(promptSubmittedPayload, "required"),
  PromptEdited: define(promptEditedPayload, "required"),
  AIResponseReceived: define(aiResponseReceivedPayload, "required"),
  // Actions
  ToolExecuted: define(toolExecutedPayload, "required"),
  FileModified: define(fileModifiedPayload, "required"),
  FilesAccepted: define(filesAcceptedPayload, "required"),
  FilesRejected: define(filesRejectedPayload, "required"),
  // Git moments (ambient: happen with or without an active session)
  GitCommitCreated: define(gitCommitCreatedPayload, "optional"),
  GitPush: define(gitPushPayload, "optional"),
  BranchChanged: define(branchChangedPayload, "optional"),
  GitTagCreated: define(gitTagCreatedPayload, "optional"),
  // Correlation overrides
  LinkConfirmed: define(linkConfirmedPayload, "optional"),
  LinkRejected: define(linkRejectedPayload, "optional"),
  // Honesty
  CaptureGap: define(captureGapPayload, "optional"),
  CaptureDegraded: define(captureDegradedPayload, "optional", "local"),
} as const satisfies Record<string, CoreEventDefinition>;

export type CoreEventType = keyof typeof CORE_EVENTS;

export const CORE_EVENT_TYPES = Object.keys(CORE_EVENTS) as readonly CoreEventType[];

export function isCoreEventType(type: string): type is CoreEventType {
  return Object.hasOwn(CORE_EVENTS, type);
}

/** Typed payload for one core event type. */
export type PayloadOf<T extends CoreEventType> = z.infer<(typeof CORE_EVENTS)[T]["payload"]>;

/**
 * Phase 2–3 types reserved by the taxonomy (§5.3) but NOT part of Spec v1.
 * Using one today is an UNKNOWN_TYPE parse error; reserving the names keeps
 * later phases additive.
 */
export const RESERVED_EVENT_TYPES = [
  "KnowledgeExtracted",
  "BenchmarkExecuted",
  "RegressionExecuted",
  "DeploymentDetected",
] as const;
