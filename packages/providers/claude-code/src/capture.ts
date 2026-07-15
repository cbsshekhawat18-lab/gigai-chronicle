/**
 * Tier-1 live capture entry point — invoked by the installed hook as
 * `chronicle capture claude-code --event <name>` with JSON on stdin.
 *
 * Fire-and-forget contract (CAPTURE-SURFACES.md §2.1): never throws, never
 * blocks on anything slow, and the CALLER always exits 0 — a misbehaving
 * hook must never break the developer's Claude Code session.
 */
import { openSync, readSync, closeSync, fstatSync } from "node:fs";
import { openProviderEngine } from "@gigaichronicle/core/emit";
import { PROVIDER } from "./identity.js";
import { SessionMap } from "./session-map.js";
import { mapHookToCandidate, type HookInput } from "./hooks.js";

export interface CaptureOutcome {
  ok: boolean;
  note?: string;
}

/** Last assistant text from the transcript tail (bounded read — Stop enrichment). */
export function readResponseTail(transcriptPath: string, maxBytes = 256 * 1024): string | null {
  try {
    const fd = openSync(transcriptPath, "r");
    try {
      const size = fstatSync(fd).size;
      const start = Math.max(0, size - maxBytes);
      const buffer = Buffer.alloc(size - start);
      readSync(fd, buffer, 0, buffer.length, start);
      const lines = buffer.toString("utf8").split("\n");
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = (lines[i] as string).trim();
        if (line === "") continue;
        try {
          const parsed = JSON.parse(line) as {
            type?: string;
            message?: { content?: Array<Record<string, unknown>> | string };
          };
          if (parsed.type !== "assistant") continue;
          const content = parsed.message?.content;
          if (typeof content === "string") return content;
          if (Array.isArray(content)) {
            const texts = content
              .filter((b) => b["type"] === "text" && typeof b["text"] === "string")
              .map((b) => b["text"] as string);
            if (texts.length > 0) return texts.join("\n");
          }
        } catch {
          continue; // torn tail of a live transcript — keep walking up
        }
      }
      return null;
    } finally {
      closeSync(fd);
    }
  } catch {
    return null;
  }
}

export async function runCapture(
  chronicleDir: string,
  eventName: string,
  stdinJson: string,
): Promise<CaptureOutcome> {
  let engine: Awaited<ReturnType<typeof openProviderEngine>> | null = null;
  try {
    let input: HookInput;
    try {
      input = JSON.parse(stdinJson) as HookInput;
    } catch {
      input = {};
    }
    engine = await openProviderEngine(chronicleDir, PROVIDER);

    if (typeof input.session_id !== "string" || input.session_id === "") {
      await engine.reportDegraded(1, 4, `hook ${eventName}: no session_id on stdin`);
      return { ok: false, note: "no session_id" };
    }
    const session = SessionMap.load(chronicleDir).resolve(input.session_id);

    const responseText =
      eventName === "Stop" && typeof input.transcript_path === "string"
        ? readResponseTail(input.transcript_path)
        : null;

    const candidate = mapHookToCandidate(eventName, input, session, responseText);
    if (candidate === null) {
      await engine.reportDegraded(1, 4, `hook ${eventName}: unmapped or malformed input`);
      return { ok: false, note: `unmapped hook ${eventName}` };
    }
    const result = await engine.emit(candidate);
    return result.accepted ? { ok: true } : { ok: false, note: result.reason };
  } catch (error) {
    // Absolute floor: no error may escape toward the hook process.
    return { ok: false, note: (error as Error).message };
  } finally {
    await engine?.close().catch(() => undefined);
  }
}
