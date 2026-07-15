/**
 * Transcript JSONL parser — tier-2 backfill (CAPTURE-SURFACES.md §2.2).
 *
 * The format is UNDOCUMENTED and version-churning, so this parser is
 * fingerprinted and fail-soft: lines it doesn't recognize are counted, and
 * past a drift threshold the whole file is skipped with a degradation
 * signal rather than half-imported garbage.
 */
import type { RawCandidate } from "@gigaichronicle/core/emit";
import type { SessionId } from "@gigaichronicle/schema";

/**
 * Line types the current format fingerprint accepts. The auxiliary types
 * carry no journey moment but ARE part of the known format — recognizing
 * them is what keeps real transcripts below the drift threshold (verified
 * against live 2026-07 transcripts while dogfooding).
 */
const KNOWN_LINE_TYPES = new Set([
  "user",
  "assistant",
  "system",
  "summary",
  "file-history-snapshot",
  "file-history-delta",
  "queue-operation",
  "attachment",
  "ai-title",
  "last-prompt",
  "pr-link",
]);

/** Bump when parsing semantics change — backfill state resets and retries. */
export const TRANSCRIPT_PARSER_VERSION = 2;

/** Above this unknown-line ratio the file is treated as a format drift. */
const DRIFT_THRESHOLD = 0.2;

interface TranscriptLine {
  type?: string;
  timestamp?: string;
  sessionId?: string;
  message?: {
    role?: string;
    content?: string | Array<Record<string, unknown>>;
  };
}

export interface ParsedTranscript {
  candidates: RawCandidate[];
  toolSessionUuid: string | null;
  linesTotal: number;
  linesUnknown: number;
  /** True when the file exceeds the drift threshold — skip and degrade. */
  drifted: boolean;
}

function textBlocks(content: string | Array<Record<string, unknown>> | undefined): string[] {
  if (typeof content === "string") return content.trim() === "" ? [] : [content];
  if (!Array.isArray(content)) return [];
  return content
    .filter((block) => block["type"] === "text" && typeof block["text"] === "string")
    .map((block) => block["text"] as string)
    .filter((text) => text.trim() !== "");
}

function toolUseBlocks(
  content: string | Array<Record<string, unknown>> | undefined,
): Array<{ name: string; input: unknown }> {
  if (!Array.isArray(content)) return [];
  return content
    .filter((block) => block["type"] === "tool_use" && typeof block["name"] === "string")
    .map((block) => ({ name: block["name"] as string, input: block["input"] }));
}

function summarize(input: unknown): string | null {
  if (typeof input !== "object" || input === null) return null;
  const json = JSON.stringify(input);
  if (json === "{}") return null;
  return json.length > 160 ? `${json.slice(0, 159)}…` : json;
}

/** Parse transcript lines into candidates for one session. */
export function parseTranscript(lines: readonly string[], session: SessionId): ParsedTranscript {
  const candidates: RawCandidate[] = [];
  let toolSessionUuid: string | null = null;
  let linesTotal = 0;
  let linesUnknown = 0;
  let firstTs: string | undefined;
  let lastTs: string | undefined;
  let firstUserText: string | null = null;

  for (const raw of lines) {
    if (raw.trim() === "") continue;
    linesTotal += 1;
    let line: TranscriptLine;
    try {
      line = JSON.parse(raw) as TranscriptLine;
    } catch {
      linesUnknown += 1;
      continue;
    }
    if (typeof line.type !== "string" || !KNOWN_LINE_TYPES.has(line.type)) {
      linesUnknown += 1;
      continue;
    }
    if (toolSessionUuid === null && typeof line.sessionId === "string") {
      toolSessionUuid = line.sessionId;
    }
    const ts = typeof line.timestamp === "string" ? line.timestamp : undefined;
    if (ts !== undefined) {
      firstTs = firstTs ?? ts;
      lastTs = ts;
    }

    if (line.type === "user" && line.message?.role === "user") {
      for (const text of textBlocks(line.message.content)) {
        firstUserText = firstUserText ?? text;
        candidates.push({
          type: "PromptSubmitted",
          session,
          actor: { kind: "human" },
          ...(ts !== undefined ? { ts } : {}),
          payload: { text },
        });
      }
    } else if (line.type === "assistant" && line.message?.role === "assistant") {
      for (const text of textBlocks(line.message.content)) {
        candidates.push({
          type: "AIResponseReceived",
          session,
          actor: { kind: "agent" },
          ...(ts !== undefined ? { ts } : {}),
          payload: { text, inResponseTo: null },
        });
      }
      for (const tool of toolUseBlocks(line.message.content)) {
        candidates.push({
          type: "ToolExecuted",
          session,
          actor: { kind: "agent" },
          ...(ts !== undefined ? { ts } : {}),
          payload: { tool: tool.name, outcome: "success", summary: summarize(tool.input), durationMs: null },
        });
      }
    }
    // system / summary / file-history-snapshot lines carry no journey moment.
  }

  const drifted = linesTotal > 0 && linesUnknown / linesTotal > DRIFT_THRESHOLD;

  if (!drifted && candidates.length > 0) {
    // Session bounds so timelines and replay have proper brackets.
    candidates.unshift({
      type: "SessionStarted",
      session,
      actor: { kind: "human" },
      ...(firstTs !== undefined ? { ts: firstTs } : {}),
      payload: {
        title: firstUserText === null ? null : firstUserText.slice(0, 72),
        resumedFrom: null,
      },
    });
    candidates.push({
      type: "SessionEnded",
      session,
      actor: { kind: "system" },
      ...(lastTs !== undefined ? { ts: lastTs } : {}),
      payload: { reason: "completed" },
    });
  }

  return { candidates: drifted ? [] : candidates, toolSessionUuid, linesTotal, linesUnknown, drifted };
}
