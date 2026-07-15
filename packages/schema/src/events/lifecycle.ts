/**
 * Lifecycle events — project and session boundaries (ARCHITECTURE.md §5.3).
 */
import { z } from "zod";
import { idPattern } from "../ids.js";

/** `chronicle init` established project identity. Once per project, ever. */
export const projectCreatedPayload = z
  .object({
    projectId: z.string().regex(new RegExp(idPattern("project"))),
    name: z.string().min(1),
  })
  .catchall(z.unknown());

/**
 * An engine opened the project on a workspace. Local visibility; throttled
 * to at most one per workspace per day (§5.3) — the throttle is engine
 * behavior (M6), not schema surface.
 */
export const projectOpenedPayload = z.object({}).catchall(z.unknown());

/** An AI working session began. */
export const sessionStartedPayload = z
  .object({
    title: z.string().min(1).nullable(),
    /** Session this one resumes, when the tool reports resumption. */
    resumedFrom: z
      .string()
      .regex(new RegExp(idPattern("session")))
      .nullable(),
  })
  .catchall(z.unknown());

/** An AI working session ended. */
export const sessionEndedPayload = z
  .object({
    reason: z.enum(["completed", "interrupted", "unknown"]),
  })
  .catchall(z.unknown());

/**
 * The workspace's path changed (folder moved/renamed). Identity continuity
 * signal (§6): lets path-keyed provider backfills re-bind old locations.
 * Local visibility — paths are machine-private.
 */
export const workspaceMovedPayload = z
  .object({
    fromPath: z.string().min(1),
    toPath: z.string().min(1),
  })
  .catchall(z.unknown());
