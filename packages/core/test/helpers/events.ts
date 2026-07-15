/** Test factories: valid ChronicleEvents and throwaway stores. */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  newId,
  type ChronicleEvent,
  type SessionId,
  type WorkspaceId,
} from "@gigaichronicle/schema";

export const WORKSPACE: WorkspaceId = newId("workspace");

export function makeTempChronicleDir(prefix = "chronicle-store-"): string {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

let tick = 0;

/** Strictly increasing canonical timestamps so ranges are testable. */
export function nextTs(): string {
  tick += 1;
  return new Date(1_752_486_731_412 + tick * 1000).toISOString().replace(/(\.\d{3})\d*Z$/, "$1Z");
}

export function promptEvent(
  session: SessionId,
  text = "Add refresh-token rotation to the auth middleware",
  overrides: Partial<Record<string, unknown>> = {},
): ChronicleEvent {
  return {
    v: 1,
    id: newId("event"),
    ts: nextTs(),
    type: "PromptSubmitted",
    session,
    actor: { kind: "human" },
    git: { head: "9fc1b2a", branch: "feat/auth", dirty: ["src/auth.ts"] },
    payload: { text },
    meta: {
      provider: "example-tool@1.0.0",
      workspace: WORKSPACE,
      schema: "PromptSubmitted/1",
      visibility: "shared",
    },
    ...overrides,
  } as ChronicleEvent;
}

/** Ambient shared event (no session): a commit observed outside any session. */
export function commitEvent(workspace: WorkspaceId = WORKSPACE): ChronicleEvent {
  return {
    v: 1,
    id: newId("event"),
    ts: nextTs(),
    type: "GitCommitCreated",
    actor: { kind: "human" },
    git: { head: "9fc1b2a", branch: "main", dirty: [] },
    payload: { sha: "9fc1b2a", subject: "auth: rotate refresh tokens", branch: "main" },
    meta: {
      provider: "example-tool@1.0.0",
      workspace,
      schema: "GitCommitCreated/1",
      visibility: "shared",
    },
  } as ChronicleEvent;
}

/** Local-visibility event → ops stream. */
export function degradedEvent(): ChronicleEvent {
  return {
    v: 1,
    id: newId("event"),
    ts: nextTs(),
    type: "CaptureDegraded",
    actor: { kind: "system" },
    git: { head: null, branch: null, dirty: [] },
    payload: {
      provider: "example-tool",
      fromTier: 1,
      toTier: 2,
      reason: "log format fingerprint mismatch",
    },
    meta: {
      provider: "example-tool@1.0.0",
      workspace: WORKSPACE,
      schema: "CaptureDegraded/1",
      visibility: "local",
    },
  } as ChronicleEvent;
}
