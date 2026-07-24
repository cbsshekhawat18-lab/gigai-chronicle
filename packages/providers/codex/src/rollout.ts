/**
 * Codex CLI rollout parser — tier-2 backfill (PROVIDERS.md row "Codex CLI").
 *
 * A Codex session is a `.jsonl` "rollout" under `~/.codex/sessions/YYYY/MM/`.
 * Each line is `{ timestamp, type, payload }`. The format is vendor-owned and
 * will churn, so this parser is fingerprinted and fail-soft: unrecognized
 * top-level line types are counted, and past a drift threshold the file is
 * skipped with a degradation signal rather than half-imported (same contract
 * as the Claude Code transcript parser).
 *
 * Mapping to Chronicle's model (deliberately one source per concept, so
 * nothing is double-counted):
 *   session_meta                          → SessionStarted / SessionEnded bounds
 *   event_msg    · user_message           → PromptSubmitted   (the human)
 *   event_msg    · agent_message          → AIResponseReceived (the agent)
 *   response_item· custom_tool_call/       → ToolExecuted
 *                  function_call
 *
 * File edits (event_msg · patch_apply_end) are intentionally NOT emitted here:
 * like the Claude Code backfill, historical file attribution belongs to live
 * capture, not to a retro-import stamping today's git state onto old work.
 */
import type { RawCandidate } from "@gigaichronicle/core/emit";
import type { SessionId } from "@gigaichronicle/schema";

/** Bump when parsing semantics change — backfill drift state resets and retries. */
export const ROLLOUT_PARSER_VERSION = 1;

/** Above this unknown-top-level-line ratio the file is treated as format drift. */
const DRIFT_THRESHOLD = 0.2;

/** Top-level `type` values the current fingerprint recognizes. */
const KNOWN_LINE_TYPES = new Set([
  "session_meta",
  "event_msg",
  "response_item",
  "world_state",
  "turn_context",
  "compacted",
  "inter_agent_communication_metadata",
]);

interface RolloutLine {
  timestamp?: string;
  type?: string;
  payload?: Record<string, unknown>;
}

/** Identity read from a rollout's session_meta line. */
export interface RolloutMeta {
  /** Codex thread id (`payload.id`) — the stable per-rollout key. */
  toolSessionUuid: string | null;
  /** Working directory the session ran in — used to scope imports to a repo. */
  cwd: string | null;
  /** Model that answered, when the rollout records one. */
  model: string | null;
  /** First session_meta timestamp, if any. */
  startedTs: string | null;
}

export interface ParsedRollout {
  candidates: RawCandidate[];
  meta: RolloutMeta;
  linesTotal: number;
  linesUnknown: number;
  /** True when the file exceeds the drift threshold — skip and degrade. */
  drifted: boolean;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** Best-effort model name from a session_meta / turn_context payload. */
function modelOf(payload: Record<string, unknown>): string | null {
  for (const key of ["model", "model_name", "slug"]) {
    const v = str(payload[key]);
    if (v !== null && !v.startsWith("<")) return v;
  }
  return null;
}

/** A short, human summary of a tool input; null when nothing useful. */
function summarize(input: unknown): string | null {
  if (input === undefined || input === null) return null;
  const text = typeof input === "string" ? input : JSON.stringify(input);
  if (text === "" || text === "{}" || text === "null") return null;
  return text.length > 160 ? `${text.slice(0, 159)}…` : text;
}

/**
 * Cheap peek: read just the session identity (thread id, cwd, model) without
 * building candidates — the backfill uses cwd to decide whether a globally
 * stored rollout belongs to THIS workspace before doing the full parse.
 */
export function readRolloutMeta(lines: readonly string[]): RolloutMeta {
  const meta: RolloutMeta = { toolSessionUuid: null, cwd: null, model: null, startedTs: null };
  for (const raw of lines) {
    if (raw.trim() === "") continue;
    let line: RolloutLine;
    try {
      line = JSON.parse(raw) as RolloutLine;
    } catch {
      continue;
    }
    if (line.type !== "session_meta" || typeof line.payload !== "object" || line.payload === null) continue;
    const p = line.payload;
    meta.toolSessionUuid = meta.toolSessionUuid ?? str(p["id"]) ?? str(p["session_id"]);
    meta.cwd = meta.cwd ?? str(p["cwd"]);
    meta.model = meta.model ?? modelOf(p);
    meta.startedTs = meta.startedTs ?? str(line.timestamp);
    if (meta.cwd !== null && meta.toolSessionUuid !== null) break; // have what we need
  }
  return meta;
}

/**
 * Parse rollout lines into candidates for one (already-resolved) session.
 * `knownModel` seeds model attribution for incremental batches, where the
 * `session_meta` line (which carries the model) has been sliced off the front.
 */
export function parseRollout(
  lines: readonly string[],
  session: SessionId,
  knownModel: string | null = null,
): ParsedRollout {
  const meta: RolloutMeta = { toolSessionUuid: null, cwd: null, model: knownModel, startedTs: null };
  const candidates: RawCandidate[] = [];
  let linesTotal = 0;
  let linesUnknown = 0;
  let firstUserText: string | null = null;
  let firstTs: string | undefined;
  let lastTs: string | undefined;

  for (const raw of lines) {
    if (raw.trim() === "") continue;
    linesTotal += 1;
    let line: RolloutLine;
    try {
      line = JSON.parse(raw) as RolloutLine;
    } catch {
      linesUnknown += 1;
      continue;
    }
    if (typeof line.type !== "string" || !KNOWN_LINE_TYPES.has(line.type)) {
      linesUnknown += 1;
      continue;
    }
    const payload = (typeof line.payload === "object" && line.payload !== null ? line.payload : {}) as Record<
      string,
      unknown
    >;
    const ts = str(line.timestamp) ?? undefined;
    if (ts !== undefined) {
      firstTs = firstTs ?? ts;
      lastTs = ts;
    }
    const agent = { kind: "agent" as const, ...(meta.model !== null ? { model: meta.model } : {}) };

    if (line.type === "session_meta") {
      meta.toolSessionUuid = meta.toolSessionUuid ?? str(payload["id"]) ?? str(payload["session_id"]);
      meta.cwd = meta.cwd ?? str(payload["cwd"]);
      meta.model = meta.model ?? modelOf(payload);
      meta.startedTs = meta.startedTs ?? ts ?? null;
      continue;
    }
    if (line.type === "turn_context") {
      meta.model = meta.model ?? modelOf(payload);
      continue;
    }
    if (line.type === "event_msg") {
      const kind = str(payload["type"]);
      if (kind === "user_message") {
        const text = str(payload["message"]);
        if (text !== null) {
          firstUserText = firstUserText ?? text;
          candidates.push({
            type: "PromptSubmitted",
            session,
            actor: { kind: "human" },
            ...(ts !== undefined ? { ts } : {}),
            payload: { text },
          });
        }
      } else if (kind === "agent_message") {
        const text = str(payload["message"]);
        if (text !== null) {
          candidates.push({
            type: "AIResponseReceived",
            session,
            actor: agent,
            ...(ts !== undefined ? { ts } : {}),
            payload: { text, inResponseTo: null },
          });
        }
      }
      continue;
    }
    if (line.type === "response_item") {
      const kind = str(payload["type"]);
      // Tool executions come from the API items; prompts/responses come from
      // event_msg above, so these two never overlap.
      if (kind === "custom_tool_call" || kind === "function_call") {
        const name = str(payload["name"]);
        if (name !== null) {
          const status = str(payload["status"]);
          candidates.push({
            type: "ToolExecuted",
            session,
            actor: agent,
            ...(ts !== undefined ? { ts } : {}),
            payload: {
              tool: name,
              // Codex marks custom_tool_call status; a function_call carries
              // none, so absence is treated as success (honest default).
              outcome: status === null || status === "completed" ? "success" : "failure",
              summary: summarize(payload["input"] ?? payload["arguments"]),
              durationMs: null,
            },
          });
        }
      }
      continue;
    }
    // world_state / compacted / inter_agent_communication_metadata: known
    // format, but no journey moment to emit.
  }

  const drifted = linesTotal > 0 && linesUnknown / linesTotal > DRIFT_THRESHOLD;
  const result: RawCandidate[] = [];
  if (!drifted && candidates.length > 0) {
    result.push({
      type: "SessionStarted",
      session,
      actor: { kind: "human" },
      ...(firstTs !== undefined ? { ts: firstTs } : {}),
      payload: { title: firstUserText === null ? null : firstUserText.slice(0, 72), resumedFrom: null },
    });
    result.push(...candidates);
    result.push({
      type: "SessionEnded",
      session,
      actor: { kind: "system" },
      ...(lastTs !== undefined ? { ts: lastTs } : {}),
      payload: { reason: "completed" },
    });
  }

  return { candidates: drifted ? [] : result, meta, linesTotal, linesUnknown, drifted };
}
