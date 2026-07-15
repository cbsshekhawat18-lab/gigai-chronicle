/**
 * Shared primitives used across the Chronicle Spec v1 schemas.
 *
 * Everything here is spec surface: third-party implementations must
 * reproduce these exact shapes (SPEC-ROADMAP.md v1).
 */
import { z } from "zod";

/**
 * Canonical timestamp form: UTC, millisecond precision, `Z` suffix —
 * exactly as in the ARCHITECTURE.md §5.2 example (`2026-07-14T10:32:11.412Z`).
 * One canonical form keeps events byte-comparable and lexicographically
 * time-sortable within a file.
 */
export const TIMESTAMP_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const timestampSchema = z
  .string()
  .regex(TIMESTAMP_REGEX, "timestamp must be UTC ISO-8601 with milliseconds and Z suffix");

/** Git object SHA — abbreviated (>=7) or full 40 hex chars (§5.2 example uses 7). */
export const GIT_SHA_REGEX = /^[0-9a-f]{7,40}$/;

export const gitShaSchema = z.string().regex(GIT_SHA_REGEX, "git sha: 7-40 lowercase hex chars");

/**
 * Reference to a payload body spilled to a content-addressed sidecar when it
 * exceeds the 64KB inline limit (§7.2 rule 5). The store (M3) performs the
 * spill; the spec defines the reference shape so every reader understands it.
 */
export const blobRefSchema = z
  .object({
    $blob: z.string().regex(/^sha256-[0-9a-f]{64}$/, "blob ref: sha256-<64 hex chars>"),
  })
  .catchall(z.unknown());

export type BlobRef = z.infer<typeof blobRefSchema>;

/** A text body that may have been spilled to a blob sidecar. */
export const textOrBlobSchema = z.union([z.string(), blobRefSchema]);

export type TextOrBlob = z.infer<typeof textOrBlobSchema>;
