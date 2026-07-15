/**
 * The Replay Engine — deterministic reconstruction (ARCHITECTURE §10,
 * ADR-0010). A pure left-fold over one session's events in append order:
 * no I/O, no wall-clock, no mutation of inputs. If it can't be replayed,
 * it wasn't captured (design law 5).
 */
import type { ChronicleEvent, EventId, TextOrBlob } from "@gigaichronicle/schema";

export interface Turn {
  role: "human" | "agent";
  text: TextOrBlob | null;
  eventId: EventId;
  ts: string;
}

export interface FileState {
  path: string;
  status: "modified" | "accepted" | "rejected";
  lastEventId: EventId;
}

export interface ToolRun {
  tool: string;
  outcome: "success" | "failure";
  summary: TextOrBlob | null;
  eventId: EventId;
  ts: string;
}

export interface GitContext {
  branch: string | null;
  head: string | null;
  commits: Array<{ sha: string; subject: string; eventId: EventId; ts: string }>;
}

export interface CaptureGapRef {
  reason: string;
  detail: string | null;
  eventId: EventId;
}

export type Fidelity = "full" | "partial" | "lossy";

export interface ReplayFrame {
  /** Event that produced this frame; frame i = state after event i. */
  at: EventId;
  ts: string;
  index: number;
  title: string | null;
  startedTs: string | null;
  endedTs: string | null;
  endedReason: string | null;
  conversation: Turn[];
  workingSet: FileState[];
  tools: ToolRun[];
  git: GitContext;
  gaps: CaptureGapRef[];
  fidelity: Fidelity;
}

/** Providers whose capture is inherently lossy (ADR-0010 fidelity rule). */
const LOSSY_PROVIDERS = new Set(["manual", "wrap"]);

const EMPTY: Omit<ReplayFrame, "at" | "ts" | "index"> = {
  title: null,
  startedTs: null,
  endedTs: null,
  endedReason: null,
  conversation: [],
  workingSet: [],
  tools: [],
  git: { branch: null, head: null, commits: [] },
  gaps: [],
  fidelity: "full",
};

function providerIdOf(event: ChronicleEvent): string {
  const ref = event.meta.provider;
  const atIndex = ref.lastIndexOf("@");
  return atIndex === -1 ? ref : ref.slice(0, atIndex);
}

function upsertFile(
  workingSet: readonly FileState[],
  paths: readonly string[],
  status: FileState["status"],
  eventId: EventId,
): FileState[] {
  const byPath = new Map(workingSet.map((f) => [f.path, f]));
  for (const p of paths) byPath.set(p, { path: p, status, lastEventId: eventId });
  return [...byPath.values()];
}

/** One reduction step (ADR-0010 table). Pure; `prev` is never mutated. */
export function reduceFrame(
  prev: Omit<ReplayFrame, "at" | "ts" | "index">,
  event: ChronicleEvent,
  sawLossyProvider: boolean,
): Omit<ReplayFrame, "at" | "ts" | "index"> {
  const payload = event.payload as Record<string, unknown>;
  const id = event.id as EventId;
  const next = { ...prev };

  switch (event.type) {
    case "SessionStarted":
      next.title = (payload["title"] as string | null) ?? null;
      next.startedTs = event.ts;
      break;
    case "SessionEnded":
      next.endedTs = event.ts;
      next.endedReason = (payload["reason"] as string) ?? null;
      break;
    case "PromptSubmitted":
    case "PromptEdited":
      next.conversation = [
        ...prev.conversation,
        { role: "human", text: (payload["text"] as TextOrBlob) ?? null, eventId: id, ts: event.ts },
      ];
      break;
    case "AIResponseReceived":
      next.conversation = [
        ...prev.conversation,
        { role: "agent", text: (payload["text"] as TextOrBlob | null) ?? null, eventId: id, ts: event.ts },
      ];
      break;
    case "ToolExecuted":
      next.tools = [
        ...prev.tools,
        {
          tool: payload["tool"] as string,
          outcome: payload["outcome"] as "success" | "failure",
          summary: (payload["summary"] as TextOrBlob | null) ?? null,
          eventId: id,
          ts: event.ts,
        },
      ];
      break;
    case "FileModified":
      next.workingSet = upsertFile(prev.workingSet, payload["paths"] as string[], "modified", id);
      break;
    case "FilesAccepted":
      next.workingSet = upsertFile(prev.workingSet, payload["paths"] as string[], "accepted", id);
      break;
    case "FilesRejected":
      next.workingSet = upsertFile(prev.workingSet, payload["paths"] as string[], "rejected", id);
      break;
    case "GitCommitCreated":
      next.git = {
        ...prev.git,
        head: (payload["sha"] as string) ?? prev.git.head,
        commits: [
          ...prev.git.commits,
          { sha: payload["sha"] as string, subject: (payload["subject"] as string) ?? "", eventId: id, ts: event.ts },
        ],
      };
      break;
    case "BranchChanged":
      next.git = { ...prev.git, branch: (payload["to"] as string) ?? prev.git.branch };
      break;
    case "CaptureGap":
      next.gaps = [
        ...prev.gaps,
        { reason: (payload["reason"] as string) ?? "unknown", detail: (payload["detail"] as string | null) ?? null, eventId: id },
      ];
      break;
    default:
      break; // Ext.* and non-frame core types: opaque timeline entries
  }

  next.fidelity = sawLossyProvider ? "lossy" : next.gaps.length > 0 ? "partial" : "full";
  return next;
}

/** Full deterministic replay of one session's events (append order). */
export function replaySession(events: readonly ChronicleEvent[]): ReplayFrame[] {
  const frames: ReplayFrame[] = [];
  let state = EMPTY;
  let sawLossy = false;
  events.forEach((event, index) => {
    sawLossy = sawLossy || LOSSY_PROVIDERS.has(providerIdOf(event));
    state = reduceFrame(state, event, sawLossy);
    frames.push({ ...state, at: event.id as EventId, ts: event.ts, index });
  });
  return frames;
}

/** State after event `index` — exact by construction (ADR-0010). */
export function frameAt(events: readonly ChronicleEvent[], index: number): ReplayFrame | null {
  if (index < 0 || index >= events.length) return null;
  return replaySession(events.slice(0, index + 1))[index] ?? null;
}
