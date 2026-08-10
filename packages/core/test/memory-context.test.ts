/**
 * Context Engine + AI continuity (Phases 5–6) — the payoff: a briefing that
 * separates current state from superseded/failed approaches, respects a budget,
 * and lets a brand-new agent continue. This is the golden cross-model scenario.
 */
import { rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import type { ChronicleEvent, SessionId } from "@gigaichronicle/schema";
import {
  EventLog,
  buildBootstrap,
  buildContinue,
  buildHandoff,
  buildProjectContext,
  listMemory,
  rebuildMemory,
} from "../src/index.js";
import { WORKSPACE, makeTempChronicleDir, nextTs, promptEvent } from "./helpers/events.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** The §41 golden project: JWT → refresh tokens → Redis-vs-Postgres → race bug. */
async function goldenProject(): Promise<{ dir: string; open: () => Promise<EventLog> }> {
  const dir = makeTempChronicleDir("chronicle-golden-");
  dirs.push(dir);
  const s = (c: string): SessionId => `ses_01ARZ3NDEKTSV4RRFFQ69G5F${c}0` as SessionId;
  const events: ChronicleEvent[] = [
    promptEvent(s("A"), "Build authentication using JWT"),
    promptEvent(s("B"), "Add refresh tokens"),
    promptEvent(s("C"), "We should use Redis for sessions"),
    promptEvent(s("C"), "No, keep session state in PostgreSQL"),
    promptEvent(s("D"), "Fix the refresh-token race condition"),
  ];
  const log = await EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
  try {
    await log.append(events);
  } finally {
    await log.close();
  }
  return { dir, open: () => EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 }) };
}

async function withLog<T>(open: () => Promise<EventLog>, fn: (log: EventLog) => Promise<T>): Promise<T> {
  const log = await open();
  try {
    return await fn(log);
  } finally {
    await log.close();
  }
}

describe("context engine", () => {
  it("separates active decisions from superseded, with provenance", async () => {
    const { dir, open } = await goldenProject();
    const ctx = await withLog(open, (log) => buildProjectContext(dir, log, "/tmp/PaymentAPI"));
    const md = ctx.markdown;
    expect(md).toContain("## Active Decisions");
    expect(md).toMatch(/Active Decisions[\s\S]*PostgreSQL/); // active
    expect(md).toMatch(/Active Decisions[\s\S]*JWT/);
    expect(md).toContain("Failed / Superseded Approaches");
    expect(md).toMatch(/Failed \/ Superseded[\s\S]*Redis/); // considered but not adopted
    expect(md).toContain("## Known Issues");
    expect(md).toContain("_(ses_"); // provenance refs present
    expect(ctx.empty).toBe(false);
  });

  it("honors the token budget (fewer items included)", async () => {
    const { dir, open } = await goldenProject();
    const tiny = await withLog(open, (log) => buildProjectContext(dir, log, "/tmp/p", { budget: 60 }));
    const big = await withLog(open, (log) => buildProjectContext(dir, log, "/tmp/p", { budget: 8000 }));
    expect(tiny.included.length).toBeLessThan(big.included.length);
    expect(tiny.included.length).toBeGreaterThan(0); // always something
  });

  it("ranks task-relevant memory to the top", async () => {
    const { dir, open } = await goldenProject();
    const ctx = await withLog(open, (log) =>
      buildProjectContext(dir, log, "/tmp/p", { task: "fix the session storage", budget: 80 }),
    );
    // With a tight budget, the session/postgres decision should make the cut.
    expect(ctx.markdown.toLowerCase()).toContain("postgres");
  });

  it("is honestly empty when there is no memory", async () => {
    const dir = makeTempChronicleDir("chronicle-empty-");
    dirs.push(dir);
    const ctx = await withLog(
      () => EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 }),
      (log) => buildProjectContext(dir, log, "/tmp/p"),
    );
    expect(ctx.empty).toBe(true);
    expect(ctx.markdown).toContain("No Project Memory yet");
  });
});

describe("ai continuity — golden cross-model handoff", () => {
  it("bootstrap tells a new agent the current state, failed approaches, and next step", async () => {
    const { dir, open } = await goldenProject();
    const boot = await withLog(open, (log) => buildBootstrap(dir, log, "/tmp/PaymentAPI"));
    const md = boot.markdown;
    expect(md).toContain("You are entering an EXISTING software project");
    expect(md).toMatch(/Active Decisions[\s\S]*PostgreSQL/);
    expect(md).toMatch(/Active Decisions[\s\S]*JWT/);
    expect(md).toMatch(/Failed \/ Superseded[\s\S]*Redis/);
    expect(md).toContain("## Recommended Next Step");
    expect(md.toLowerCase()).toContain("race condition"); // the unresolved work
    expect(md.toLowerCase()).toContain("refresh tokens"); // the requested feature exists
  });

  it("continue produces a ready-to-paste continuation prompt", async () => {
    const { dir, open } = await goldenProject();
    const cont = await withLog(open, (log) => buildContinue(dir, log, "/tmp/p"));
    expect(cont.markdown).toContain("Continue development on this EXISTING project");
    expect(cont.markdown).toContain("Start by explaining your implementation plan");
    expect(cont.markdown.toLowerCase()).toContain("do not repeat"); // guardrail
  });

  it("handoff renders sections and persists a handoff item into memory", async () => {
    const { dir, open } = await goldenProject();
    const ho = await withLog(open, (log) =>
      buildHandoff(dir, log, "/tmp/p", { objective: "finish auth", now: "2026-02-01T00:00:00.000Z" }),
    );
    expect(ho.markdown).toContain("# Development Handoff");
    expect(ho.markdown).toContain("## Objective");
    expect(ho.item?.kind).toBe("handoff");
    // It was persisted — a later read finds it.
    const stored = await listMemory(dir);
    expect(stored.some((m) => m.kind === "handoff")).toBe(true);
  });

  it("a persisted handoff survives `memory rebuild` (authored, not derived)", async () => {
    const { dir, open } = await goldenProject();
    await withLog(open, (log) => buildHandoff(dir, log, "/tmp/p", { objective: "finish auth", now: "2026-02-01T00:00:00.000Z" }));
    await withLog(open, (log) => rebuildMemory(dir, log)); // clears + re-derives everything else
    const stored = await listMemory(dir);
    expect(stored.some((m) => m.kind === "handoff")).toBe(true); // not destroyed by rebuild
  });
});
