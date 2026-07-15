/**
 * Blob spill-over — ARCHITECTURE.md §7.2 rule 5 + ADR-0007.
 *
 * Top-level string payload fields larger than 64KB (UTF-8) are written to a
 * content-addressed sidecar next to the stream file and replaced by
 * `{ "$blob": "sha256-<hash>" }`. If replacing a field would make the event
 * schema-invalid, the field stays inline: big-but-valid beats
 * small-but-invalid.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseChronicleEvent, type ChronicleEvent, type BlobRef } from "@gigaichronicle/schema";

/** Fixed by ADR-0005 — a spec constant, not a knob. */
export const SPILL_THRESHOLD_BYTES = 64 * 1024;

export interface SpillResult {
  event: ChronicleEvent;
  /** Payload field names that were spilled, with their blob file paths. */
  spilled: Array<{ field: string; file: string }>;
}

function sha256Hex(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function blobFileName(content: string): string {
  return `sha256-${sha256Hex(content)}.md`;
}

/**
 * Spill oversized top-level string payload fields of `event` into `blobDir`.
 * Returns the (possibly rewritten) event; the original object is not mutated.
 */
export async function spillOversizedFields(
  event: ChronicleEvent,
  blobDir: string,
): Promise<SpillResult> {
  const payload = event.payload;
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { event, spilled: [] };
  }

  const oversized = Object.entries(payload as Record<string, unknown>).filter(
    ([, value]) => typeof value === "string" && Buffer.byteLength(value, "utf8") > SPILL_THRESHOLD_BYTES,
  ) as Array<[string, string]>;
  if (oversized.length === 0) return { event, spilled: [] };

  const newPayload: Record<string, unknown> = { ...(payload as Record<string, unknown>) };
  const spilled: SpillResult["spilled"] = [];
  const pendingWrites: Array<{ file: string; content: string }> = [];

  for (const [field, content] of oversized) {
    const hash = sha256Hex(content);
    const ref: BlobRef = { $blob: `sha256-${hash}` };
    const candidatePayload = { ...newPayload, [field]: ref };
    const candidate = { ...event, payload: candidatePayload };
    if (!parseChronicleEvent(candidate).ok) continue; // field is not blob-typed — keep inline
    newPayload[field] = ref;
    const file = path.join(blobDir, `sha256-${hash}.md`);
    pendingWrites.push({ file, content });
    spilled.push({ field, file });
  }
  if (spilled.length === 0) return { event, spilled: [] };

  await mkdir(blobDir, { recursive: true });
  for (const { file, content } of pendingWrites) {
    // Content-addressed: identical content → identical file; rewrite is a no-op.
    await writeFile(file, content, "utf8");
  }
  return { event: { ...event, payload: newPayload } as ChronicleEvent, spilled };
}

/** Resolve a blob reference back to its content, verifying the hash. */
export async function readBlob(blobDir: string, ref: BlobRef): Promise<string> {
  const file = path.join(blobDir, `${ref.$blob}.md`);
  const content = await readFile(file, "utf8");
  const expected = ref.$blob.slice("sha256-".length);
  const actual = sha256Hex(content);
  if (actual !== expected) {
    throw new Error(`blob integrity check failed for ${file}: sha256-${actual}`);
  }
  return content;
}
