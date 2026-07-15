/**
 * `.chronicle/config.json` schema — ARCHITECTURE.md §7.3 (v2 trimmed surface).
 *
 * The only shared-mutable file in the store: small and rarely touched so
 * git's normal merge handles it. `sync` and `plugins` keys are RESERVED by
 * the spec but absent until their phases ship — unknown keys are preserved
 * (catchall), so a newer minor config still loads here.
 */
import { z } from "zod";
import { idPattern } from "./ids.js";

export const CONFIG_VERSION = 1;

/** Per-provider capture switch. */
export const providerModeSchema = z.enum(["auto", "on", "off"]);

/** Default visibility for newly captured sessions (A2 social-privacy model). */
export const sessionVisibilityDefaultSchema = z.enum(["shared", "private"]);

export const configSchema = z
  .object({
    /** JSON-Schema URL; optional so hand-created files remain valid. */
    $schema: z.string().optional(),
    version: z.number().int().min(1),
    project: z
      .object({
        id: z.string().regex(new RegExp(idPattern("project"))),
        name: z.string().min(1),
      })
      .catchall(z.unknown()),
    capture: z
      .object({
        providers: z.record(z.string().min(1), providerModeSchema),
        /**
         * "full" (default when absent) captures redacted content;
         * "metadata" stores event shapes/timings but no prompt text —
         * the high-sensitivity mode offered at init (resolved decision #3).
         */
        mode: z.enum(["full", "metadata"]).optional(),
        redaction: z
          .object({
            secrets: z.boolean(),
            customPatterns: z.array(z.string()),
          })
          .catchall(z.unknown()),
        visibility: sessionVisibilityDefaultSchema,
        gitTrailer: z.boolean(),
      })
      .catchall(z.unknown()),
    storage: z
      .object({
        digest: z.object({ session: z.boolean() }).catchall(z.unknown()),
        retention: z.object({ mode: z.literal("keep-all") }).catchall(z.unknown()),
      })
      .catchall(z.unknown()),
  })
  .catchall(z.unknown());

export type ChronicleConfig = z.infer<typeof configSchema>;
