/**
 * Host ↔ webview message protocol (§15.3) — versioned, snapshot/patch.
 * The webview is a pure projection: no business logic, no fs/git access.
 *
 * Replay travels as compact DELTA entries in lazy windows (newest first),
 * never as raw frames — raw frames are quadratic in session size.
 */
import type { StreamEntry, StreamSummary } from "./stream.js";
import type { Prompt, PromptVersionNode } from "@gigaichronicle/core";

export interface PromptWithHistory extends Prompt {
  history: PromptVersionNode[];
  /** Lifecycle: "used" = capture observed it submitted (or it was promoted
   *  from a session); "saved" = curated for the future, not yet seen in use;
   *  "unknown" = usage could not be derived (the log was unreadable) — shown
   *  as unavailable rather than falsely as "saved". */
  status: "used" | "saved" | "unknown";
  /** Observed uses across versions — derived from the log, never a counter. */
  uses: number;
  lastUsedTs: string | null;
}

/** Development Intelligence summary for the dashboard panel (derived, read-only). */
export interface IntelligenceSummary {
  health: number;
  warnings: number;
  unfinished: number;
  stuck: number;
  debt: number;
  topStuck: string | null;
}

/** Project Memory summary for the dashboard's Memory panel (derived, read-only). */
export interface MemorySummary {
  total: number;
  currentWork: string | null;
  activeDecisions: number;
  constraints: number;
  todos: number;
  knownIssues: number;
  failedApproaches: number;
  handoffs: number;
}

/** Store configuration + posture for the Settings page (read from config.json,
 *  ADR-0009). Read-only projection — the dashboard never writes config. */
export interface SettingsInfo {
  /** False when config.json was missing or unparseable — the values below are
   *  then safe defaults, NOT the real config, and the page says so. */
  configReadable: boolean;
  projectName: string | null;
  /** Absolute path to the `.chronicle/` store on this machine. */
  storePath: string;
  /** Capture providers and their mode (auto / off). */
  providers: Array<{ id: string; mode: string }>;
  /** Secret redaction at capture, and how many custom patterns are configured. */
  redactSecrets: boolean;
  customPatterns: number;
  /** Default visibility for new sessions: "private" | "shared". */
  visibility: string;
  /** Whether the `Chronicle-Session:` commit trailer is written (opt-in). */
  gitTrailer: boolean;
  /** Retention mode (e.g. "keep-all"). */
  retention: string;
  /** Whether per-session digests are written. */
  sessionDigest: boolean;
}

export interface SessionListItem {
  /** Human display name: title, else first prompt, else date — never a raw id. */
  label: string;
  /** Open session with recent activity — the one being worked in right now. */
  live: boolean;
  session: string;
  title: string | null;
  startedTs: string | null;
  endedTs: string | null;
  turns: number;
  tools: number;
  fidelity: "full" | "partial" | "lossy";
  gaps: number;
  /** Providers that captured this session (badges + filter). */
  providers: string[];
  /** Models that answered in this session (badges + filter). */
  models: string[];
}

export interface ReplayWindow {
  session: string;
  info?: SessionListItem;
  summary: StreamSummary;
  /** Entries [offset, offset+entries.length) of the full stream. */
  entries: StreamEntry[];
  offset: number;
  totalEntries: number;
  /** "replace" = new session selected (land on latest); "prepend" = older window loaded. */
  mode: "replace" | "prepend";
}

/** host → webview */
export type HostMessage =
  | {
      kind: "snapshot";
      v: 1;
      data: {
        sessions: SessionListItem[];
        prompts?: PromptWithHistory[];
        settings?: SettingsInfo;
        memory?: MemorySummary;
        intelligence?: IntelligenceSummary;
      };
    }
  | { kind: "patch"; v: 1; data: ReplayWindow }
  | { kind: "reply"; v: 1; reqId: number; error?: string };

/** webview → host */
export type WebviewMessage =
  | { kind: "query"; v: 1; reqId: number; name: "sessions" }
  | { kind: "query"; v: 1; reqId: number; name: "frames"; args: { session: string } }
  | { kind: "query"; v: 1; reqId: number; name: "earlier"; args: { session: string; before: number } }
  | { kind: "restore"; v: 1; eventId: string }
  /** Open the two chosen prompts in the native diff editor (ADR-0013 evolution). */
  | { kind: "compare"; v: 1; a: string; b: string }
  /** Open a library prompt version in the native editor. */
  | { kind: "openPrompt"; v: 1; slug: string; version: number }
  /** Put a library prompt's body on the clipboard — "use" it in your AI tool. */
  | { kind: "usePrompt"; v: 1; slug: string; version: number }
  /** Diff two library prompts (cross-slug) in the native diff editor. */
  | { kind: "compareLibrary"; v: 1; aSlug: string; aVersion: number; bSlug: string; bVersion: number }
  /** Save a captured prompt into the library — the QuickPick flow, from the dashboard. */
  | { kind: "savePrompt"; v: 1 }
  /** Project Memory / Development Intelligence panel actions → run the command. */
  | { kind: "memoryAction"; v: 1; action: "prepare" | "handoff" | "continue" | "search" | "preflight" | "whynot" | "risk" };
