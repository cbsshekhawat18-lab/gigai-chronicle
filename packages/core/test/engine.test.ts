import { rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { newId, type ChronicleEvent } from "@gigaichronicle/schema";
import { EventEngine, EventLog, fixedGitReader } from "../src/index.js";
import { WORKSPACE, makeTempChronicleDir } from "./helpers/events.js";

const dirs: string[] = [];
function tempDir(): string {
  const dir = makeTempChronicleDir("chronicle-engine-");
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const GIT = { head: "9fc1b2a", branch: "feat/auth", dirty: ["src/auth.ts"] };

async function openEngine(dir: string): Promise<EventEngine> {
  return EventEngine.open(dir, {
    workspaceId: WORKSPACE,
    provider: { id: "example-tool", version: "1.0.0" },
    gitReader: fixedGitReader(GIT),
    fsyncIntervalMs: 0,
  });
}

async function storedEvents(dir: string): Promise<ChronicleEvent[]> {
  const log = await EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
  const events: ChronicleEvent[] = [];
  for await (const { event } of log.scan({ visibility: "all" })) events.push(event);
  await log.close();
  return events;
}

describe("EventEngine.emit — the four stages", () => {
  it("enriches a valid candidate: id, ts, actor, git, meta all stamped", async () => {
    const dir = tempDir();
    const engine = await openEngine(dir);
    const session = newId("session");
    const result = await engine.emit({
      type: "PromptSubmitted",
      session,
      actor: { kind: "human" },
      payload: { text: "Add refresh-token rotation" },
    });
    await engine.close();

    expect(result.accepted).toBe(true);
    const [event] = await storedEvents(dir);
    expect(event).toMatchObject({
      v: 1,
      type: "PromptSubmitted",
      session,
      actor: { kind: "human" },
      git: GIT,
      meta: {
        provider: "example-tool@1.0.0",
        workspace: WORKSPACE,
        schema: "PromptSubmitted/1",
        visibility: "shared",
      },
    });
    expect(event?.id).toMatch(/^evt_/);
    expect(event?.ts).toMatch(/Z$/);
  });

  it("applies registry visibility defaults (CaptureDegraded → local ops stream)", async () => {
    const dir = tempDir();
    const engine = await openEngine(dir);
    const result = await engine.reportDegraded(1, 2, "fingerprint mismatch");
    await engine.close();
    expect(result.accepted).toBe(true);
    const [event] = await storedEvents(dir);
    expect(event?.meta.visibility).toBe("local");
  });

  it("accepts Ext.<provider>.* with opaque payloads", async () => {
    const dir = tempDir();
    const engine = await openEngine(dir);
    const result = await engine.emit({
      type: "Ext.example-tool.SubagentStarted",
      session: newId("session"),
      payload: { anything: [1, 2, 3] },
    });
    await engine.close();
    expect(result.accepted).toBe(true);
    const [event] = await storedEvents(dir);
    expect(event?.meta.schema).toBe("Ext.example-tool.SubagentStarted/1");
  });

  it("coerces provider timestamps to canonical form", async () => {
    const dir = tempDir();
    const engine = await openEngine(dir);
    await engine.emit({
      type: "PromptSubmitted",
      session: newId("session"),
      ts: "2026-07-14T10:32:11+02:00", // offset form → canonical UTC
      payload: { text: "hello" },
    });
    await engine.close();
    const [event] = await storedEvents(dir);
    expect(event?.ts).toBe("2026-07-14T08:32:11.000Z");
  });

  it("gap: unknown type is dropped-with-CaptureGap, reason without payload content", async () => {
    const dir = tempDir();
    const engine = await openEngine(dir);
    const result = await engine.emit({
      type: "TotallyMadeUp",
      payload: { secretish: "do not leak this text" },
    });
    await engine.close();

    expect(result.accepted).toBe(false);
    const events = await storedEvents(dir);
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("CaptureGap");
    const detail = (events[0]?.payload as { detail: string }).detail;
    expect(detail).toContain("TotallyMadeUp");
    expect(detail).not.toContain("do not leak");
  });

  it("gap: session-binding violations are strict (the engine cannot be lied to)", async () => {
    const dir = tempDir();
    const engine = await openEngine(dir);
    const noSession = await engine.emit({ type: "PromptSubmitted", payload: { text: "x" } });
    const badScope = await engine.emit({
      type: "ProjectOpened",
      session: newId("session"),
      payload: {},
    });
    await engine.close();
    expect(noSession.accepted).toBe(false);
    expect(badScope.accepted).toBe(false);
    const events = await storedEvents(dir);
    expect(events.filter((e) => e.type === "CaptureGap")).toHaveLength(2);
  });

  it("gap: oversized payloads are refused with the size guard", async () => {
    const dir = tempDir();
    const engine = await openEngine(dir);
    const result = await engine.emit({
      type: "PromptSubmitted",
      session: newId("session"),
      payload: { text: "x".repeat(1024 * 1024 + 1) },
    });
    await engine.close();
    expect(result.accepted).toBe(false);
    expect((result as { reason: string }).reason).toContain("exceeds");
  });

  it("determinism: same candidate + same repo state → identical event modulo id/ts", async () => {
    const dir = tempDir();
    const engine = await openEngine(dir);
    const session = newId("session");
    const candidate = {
      type: "PromptSubmitted",
      session,
      actor: { kind: "human" as const },
      payload: { text: "deterministic enrichment" },
    };
    await engine.emit({ ...candidate });
    await engine.emit({ ...candidate });
    await engine.close();

    const [first, second] = await storedEvents(dir);
    const strip = (e: ChronicleEvent): Omit<ChronicleEvent, "id" | "ts"> => {
      const { id: _id, ts: _ts, ...rest } = e;
      return rest;
    };
    expect(strip(second as ChronicleEvent)).toEqual(strip(first as ChronicleEvent));
    // Snapshot with run-volatile identity normalized (session/workspace are
    // random per test run; everything else must be byte-stable).
    const normalized = JSON.parse(
      JSON.stringify(strip(first as ChronicleEvent))
        .replaceAll(session, "ses_SNAPSHOT00000000000000000")
        .replaceAll(WORKSPACE, "wks_SNAPSHOT00000000000000000"),
    ) as unknown;
    expect(normalized).toMatchSnapshot();
  });
});
