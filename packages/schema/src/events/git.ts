/**
 * Git moment events (ARCHITECTURE.md §5.3) — emitted by the correlation
 * layer's watchers (§11). Session binding is optional: commits happen with
 * or without an active AI session.
 */
import { z } from "zod";
import { gitShaSchema } from "../shared.js";

/** A commit landed. */
export const gitCommitCreatedPayload = z
  .object({
    sha: gitShaSchema,
    /** Commit subject line only — never the full body (size discipline). */
    subject: z.string(),
    branch: z.string().min(1).nullable(),
  })
  .catchall(z.unknown());

/** A push happened. */
export const gitPushPayload = z
  .object({
    remote: z.string().min(1),
    branch: z.string().min(1).nullable(),
  })
  .catchall(z.unknown());

/** Branch created/switched (includes checkout — §5.3). */
export const branchChangedPayload = z
  .object({
    from: z.string().min(1).nullable(),
    to: z.string().min(1),
  })
  .catchall(z.unknown());

/** A tag was created. */
export const gitTagCreatedPayload = z
  .object({
    tag: z.string().min(1),
    sha: gitShaSchema,
  })
  .catchall(z.unknown());
