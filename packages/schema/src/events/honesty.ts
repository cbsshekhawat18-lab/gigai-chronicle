/**
 * Honesty events (ARCHITECTURE.md §5.3) — "we know what we missed."
 *
 * CaptureGap is deliberately SHARED: gaps are part of the record, and replay
 * must surface them rather than interpolate (§10). CaptureDegraded is LOCAL:
 * it describes one machine's capture health, not the journey.
 */
import { z } from "zod";

/** Something was missed and we know it (torn write, unparseable candidate…). */
export const captureGapPayload = z
  .object({
    reason: z.enum(["torn-write", "unparseable-candidate", "provider-gap", "unknown"]),
    detail: z.string().nullable(),
  })
  .catchall(z.unknown());

/** A provider fell down the capture tier ladder (§4). */
export const captureDegradedPayload = z
  .object({
    provider: z.string().min(1),
    fromTier: z.number().int().min(1).max(4),
    toTier: z.number().int().min(1).max(4),
    reason: z.string().min(1),
  })
  .catchall(z.unknown());
