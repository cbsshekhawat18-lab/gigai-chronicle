/**
 * Action events — what the agent did and what the human kept
 * (ARCHITECTURE.md §5.3).
 */
import { z } from "zod";
import { idPattern } from "../ids.js";
import { textOrBlobSchema } from "../shared.js";

/** Agent ran a tool (bash, edit, search, …). */
export const toolExecutedPayload = z
  .object({
    /** Tool name as the provider reports it (e.g. "Edit", "bash"). */
    tool: z.string().min(1),
    outcome: z.enum(["success", "failure"]),
    /** Short human-readable summary; null when unavailable. */
    summary: textOrBlobSchema.nullable(),
    durationMs: z.number().int().nonnegative().nullable(),
  })
  .catchall(z.unknown());

/**
 * Files changed during a session — coalesced, debounced batches (§5.3), so
 * an 8-hour agent run yields batch events, not one event per keystroke.
 */
export const fileModifiedPayload = z
  .object({
    /** Workspace-relative paths, POSIX separators. */
    paths: z.array(z.string().min(1)).min(1),
  })
  .catchall(z.unknown());

const fileDecisionShape = {
  /** Workspace-relative paths, POSIX separators. */
  paths: z.array(z.string().min(1)).min(1),
  /** The AIResponseReceived that produced the changes, when attributable. */
  responseEvent: z
    .string()
    .regex(new RegExp(idPattern("event")))
    .nullable(),
};

/** Human accepted AI-produced changes. */
export const filesAcceptedPayload = z.object(fileDecisionShape).catchall(z.unknown());

/** Human rejected AI-produced changes. */
export const filesRejectedPayload = z.object(fileDecisionShape).catchall(z.unknown());
