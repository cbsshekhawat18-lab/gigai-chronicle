/**
 * Host-side stream projection (§15.3): the Replay Engine's frames folded
 * into compact per-moment DELTA entries — one reconstruction, many
 * renderers (ADR-0010). Sending frames raw is quadratic (frame i carries
 * all state up to i); entries are O(1) each, so a 10k-event session ships
 * kilobytes, not megabytes, and the webview can lazy-load windows
 * (founder feedback: "VS Code huge — lazy load").
 *
 * Wire types are deliberately self-contained plain data.
 */
import type { ReplayFrame } from "@gigaichronicle/core";

export interface ToolRunLite {
  tool: string;
  outcome: "success" | "failure";
  summary: string | null;
}

export type StreamEntry =
  | { kind: "day"; day: string }
  | { kind: "session"; ts: string; note: string }
  | {
      kind: "turn";
      ts: string;
      role: "human" | "agent";
      text: string | null;
      large: string | null;
      eventId: string;
      /** A code checkpoint exists for this moment (ADR-0012 restore). */
      restorable: boolean;
    }
  | { kind: "tools"; ts: string; runs: ToolRunLite[] }
  | { kind: "commit"; ts: string; sha: string; subject: string }
  | { kind: "file"; ts: string; path: string; status: string }
  | { kind: "gap"; ts: string; reason: string; detail: string | null };

export interface StreamSummary {
  turns: number;
  tools: number;
  /** Distinct files this session touched (workingSet size) — real, not tokens. */
  files: number;
  fidelity: string;
  gaps: number;
  startedTs: string | null;
  endedTs: string | null;
}

function liteText(value: unknown): { text: string | null; large: string | null } {
  if (typeof value === "string") return { text: value, large: null };
  if (typeof value === "object" && value !== null && "$blob" in value) {
    return { text: null, large: (value as { $blob: string }).$blob };
  }
  return { text: null, large: null };
}

function liteSummary(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "$blob" in value) {
    return `(large content: ${(value as { $blob: string }).$blob})`;
  }
  return null;
}

/** Fold frames into delta entries; consecutive tool runs group into one entry. */
export function buildStream(
  frames: readonly ReplayFrame[],
  restorableEvents: ReadonlySet<string> = new Set(),
): StreamEntry[] {
  const entries: StreamEntry[] = [];
  let day = "";
  const push = (entry: StreamEntry, ts: string): void => {
    const entryDay = ts.slice(0, 10);
    if (entryDay !== day) {
      day = entryDay;
      entries.push({ kind: "day", day });
    }
    entries.push(entry);
  };

  frames.forEach((frame, i) => {
    const prev = i === 0 ? null : (frames[i - 1] ?? null);
    if ((prev === null || prev.startedTs === null) && frame.startedTs !== null) {
      push({ kind: "session", ts: frame.ts, note: "session started" }, frame.ts);
    }
    if (prev === null || frame.conversation.length > (prev?.conversation.length ?? 0)) {
      const turn = frame.conversation[frame.conversation.length - 1];
      if (turn !== undefined) {
        const body = liteText(turn.text);
        push(
          {
            kind: "turn",
            ts: frame.ts,
            role: turn.role,
            text: body.text,
            large: body.large,
            eventId: turn.eventId,
            restorable: restorableEvents.has(turn.eventId),
          },
          frame.ts,
        );
      }
    } else if (prev !== null && frame.tools.length > prev.tools.length) {
      const run = frame.tools[frame.tools.length - 1];
      if (run !== undefined) {
        const lite: ToolRunLite = {
          tool: run.tool,
          outcome: run.outcome,
          summary: liteSummary(run.summary),
        };
        const lastEntry = entries[entries.length - 1];
        if (lastEntry !== undefined && lastEntry.kind === "tools") lastEntry.runs.push(lite);
        else push({ kind: "tools", ts: frame.ts, runs: [lite] }, frame.ts);
      }
    } else if (prev !== null && frame.git.commits.length > prev.git.commits.length) {
      const commit = frame.git.commits[frame.git.commits.length - 1];
      if (commit !== undefined)
        push({ kind: "commit", ts: frame.ts, sha: commit.sha, subject: commit.subject }, frame.ts);
    } else if (prev !== null && frame.workingSet.length > prev.workingSet.length) {
      const file = frame.workingSet[frame.workingSet.length - 1];
      if (file !== undefined)
        push({ kind: "file", ts: frame.ts, path: file.path, status: file.status }, frame.ts);
    } else if (prev !== null && frame.gaps.length > prev.gaps.length) {
      const gap = frame.gaps[frame.gaps.length - 1];
      if (gap !== undefined)
        push({ kind: "gap", ts: frame.ts, reason: gap.reason, detail: gap.detail }, frame.ts);
    }
    if ((prev === null || prev.endedTs === null) && frame.endedTs !== null) {
      push(
        { kind: "session", ts: frame.ts, note: `session ended (${frame.endedReason ?? "unknown"})` },
        frame.ts,
      );
    }
  });
  return entries;
}

export function summarize(frames: readonly ReplayFrame[]): StreamSummary {
  const last = frames[frames.length - 1];
  return {
    turns: last?.conversation.length ?? 0,
    tools: last?.tools.length ?? 0,
    files: last?.workingSet.length ?? 0,
    fidelity: last?.fidelity ?? "full",
    gaps: last?.gaps.length ?? 0,
    startedTs: last?.startedTs ?? null,
    endedTs: last?.endedTs ?? null,
  };
}
