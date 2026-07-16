/**
 * Hook-input → RawCandidate mapping (CAPTURE-SURFACES.md §2.1). Pure and
 * synchronous so it is trivially testable; unknown/malformed input yields
 * `null` and the capture entry point reports a degradation — never a crash
 * into Claude Code's process (fire-and-forget contract).
 */
import type { RawCandidate } from "@gigaichronicle/core/emit";
import type { SessionId } from "@gigaichronicle/schema";

/** The stdin JSON every Claude Code hook receives (documented surface). */
export interface HookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  hook_event_name?: string;
  /** UserPromptSubmit */
  prompt?: string;
  /** SessionStart */
  source?: string;
  /** SessionEnd */
  reason?: string;
  /** PostToolUse */
  tool_name?: string;
  tool_input?: unknown;
  tool_response?: unknown;
  [key: string]: unknown;
}

/** Hook events Chronicle installs (M7 core set). */
export const CAPTURED_HOOK_EVENTS = [
  "SessionStart",
  "SessionEnd",
  "UserPromptSubmit",
  "Stop",
  "PostToolUse",
] as const;

function summarizeToolInput(input: unknown): string | null {
  if (typeof input !== "object" || input === null) return null;
  const record = input as Record<string, unknown>;
  for (const key of ["file_path", "command", "pattern", "url", "path"]) {
    if (typeof record[key] === "string") return `${key}=${truncate(record[key] as string)}`;
  }
  const json = JSON.stringify(record);
  return json === "{}" ? null : truncate(json);
}

function truncate(value: string, max = 160): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/**
 * Map one hook invocation to a candidate. `session` is the Chronicle id the
 * session map resolved; `responseText` is the transcript tail for Stop
 * events (read by the caller — this function stays pure).
 */
export function mapHookToCandidate(
  eventName: string,
  input: HookInput,
  session: SessionId,
  responseText: string | null,
  responseModel: string | null = null,
): RawCandidate | null {
  switch (eventName) {
    case "SessionStart":
      return {
        type: "SessionStarted",
        session,
        actor: { kind: "human" },
        payload: { title: null, resumedFrom: null },
      };
    case "SessionEnd":
      return {
        type: "SessionEnded",
        session,
        actor: { kind: "system" },
        payload: {
          reason: input.reason === "clear" || input.reason === "logout" || input.reason === "exit"
            ? "completed"
            : "unknown",
        },
      };
    case "UserPromptSubmit":
      if (typeof input.prompt !== "string") return null;
      return {
        type: "PromptSubmitted",
        session,
        actor: { kind: "human" },
        payload: { text: input.prompt },
      };
    case "Stop":
      return {
        type: "AIResponseReceived",
        session,
        actor: { kind: "agent", ...(responseModel !== null ? { model: responseModel } : {}) },
        payload: { text: responseText, inResponseTo: null },
      };
    case "PostToolUse": {
      if (typeof input.tool_name !== "string") return null;
      const failed =
        typeof input.tool_response === "object" &&
        input.tool_response !== null &&
        ("error" in (input.tool_response as Record<string, unknown>) ||
          (input.tool_response as { is_error?: boolean }).is_error === true);
      return {
        type: "ToolExecuted",
        session,
        actor: { kind: "agent" },
        payload: {
          tool: input.tool_name,
          outcome: failed ? "failure" : "success",
          summary: summarizeToolInput(input.tool_input),
          durationMs: null,
        },
      };
    }
    default:
      return null; // unknown hook — caller records the degradation
  }
}
