/**
 * Host ↔ webview message protocol (§15.3) — versioned, snapshot/patch.
 * The webview is a pure projection: no business logic, no fs/git access.
 *
 * Replay travels as compact DELTA entries in lazy windows (newest first),
 * never as raw frames — raw frames are quadratic in session size.
 */
import type { StreamEntry, StreamSummary } from "./stream.js";
import type { Prompt } from "@gigaichronicle/core";

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
  | { kind: "snapshot"; v: 1; data: { sessions: SessionListItem[]; prompts?: Prompt[] } }
  | { kind: "patch"; v: 1; data: ReplayWindow }
  | { kind: "reply"; v: 1; reqId: number; error?: string };

/** webview → host */
export type WebviewMessage =
  | { kind: "query"; v: 1; reqId: number; name: "sessions" }
  | { kind: "query"; v: 1; reqId: number; name: "frames"; args: { session: string } }
  | { kind: "query"; v: 1; reqId: number; name: "earlier"; args: { session: string; before: number } }
  | { kind: "restore"; v: 1; eventId: string };
