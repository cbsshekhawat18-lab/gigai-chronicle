/**
 * Host ↔ webview message protocol (§15.3) — versioned, snapshot/patch.
 * The webview is a pure projection: no business logic, no fs/git access.
 */
import type { ReplayFrame } from "@gigaichronicle/core";

export interface SessionListItem {
  /** Human display name: title, else first prompt, else date — never a raw id. */
  label: string;
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

/** host → webview */
export type HostMessage =
  | { kind: "snapshot"; v: 1; data: { sessions: SessionListItem[] } }
  | { kind: "patch"; v: 1; data: { session: string; frames: ReplayFrame[] } }
  | { kind: "reply"; v: 1; reqId: number; error?: string };

/** webview → host */
export type WebviewMessage =
  | { kind: "query"; v: 1; reqId: number; name: "sessions" }
  | { kind: "query"; v: 1; reqId: number; name: "frames"; args: { session: string } };
