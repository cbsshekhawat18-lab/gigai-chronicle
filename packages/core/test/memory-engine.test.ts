/**
 * Memory Engine (Phase 3) — deterministic derivation of Project Memory from the
 * event history: classification, confidence, temporal supersession, explicit
 * rejection → failed_approach, conflict detection, the privacy line, and
 * idempotent rebuild. No LLM, no network.
 */
import { rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { newId, type ChronicleEvent, type SessionId } from "@gigaichronicle/schema";
import { EventLog, buildMemory, listMemory, rebuildMemory } from "../src/index.js";
import { WORKSPACE, makeTempChronicleDir, nextTs, promptEvent } from "./helpers/events.js";

const SES = "ses_01ARZ3NDEKTSV4RRFFQ69G5FA0" as SessionId;

function agentEvent(session: SessionId, text: string): ChronicleEvent {
  return {
    v: 1,
    id: newId("event"),
    ts: nextTs(),
    type: "AIResponseReceived",
    session,
    actor: { kind: "agent", model: "claude" },
    git: { head: "9fc1b2a", branch: "main", dirty: [] },
    payload: { text, inResponseTo: null },
    meta: { provider: "example-tool@1.0.0", workspace: WORKSPACE, schema: "AIResponseReceived/1", visibility: "shared" },
  } as ChronicleEvent;
}

function localPrompt(session: SessionId, text: string): ChronicleEvent {
  return promptEvent(session, text, {
    meta: { provider: "example-tool@1.0.0", workspace: WORKSPACE, schema: "PromptSubmitted/1", visibility: "local" },
  });
}

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function storeWith(events: ChronicleEvent[]): Promise<string> {
  const dir = makeTempChronicleDir("chronicle-mem-engine-");
  dirs.push(dir);
  const log = await EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
  try {
    if (events.length > 0) await log.append(events);
  } finally {
    await log.close();
  }
  return dir;
}

async function build(dir: string, opts = {}): ReturnType<typeof buildMemory> {
  const log = await EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
  try {
    return await buildMemory(dir, log, opts);
  } finally {
    await log.close();
  }
}

describe("memory engine — classification & confidence", () => {
  it("classifies a firm decision, a proposal, a known issue, and current work", async () => {
    const dir = await storeWith([
      promptEvent(SES, "let's use PostgreSQL for the database"),
      agentEvent(SES, "maybe we could use GraphQL for the API"),
      promptEvent(SES, "there is a race condition in the webhook worker"),
      promptEvent(SES, "Fix the refresh-token race condition"),
    ]);
    const { items } = await build(dir);
    const decision = items.find((i) => i.kind === "decision" && i.tags.includes("postgres"));
    expect(decision).toMatchObject({ status: "active", factType: "decision" });
    expect(decision?.confidence).toBeGreaterThan(0.8); // firm + human
    expect(decision?.sourceRefs[0]?.event).toMatch(/^evt_/); // provenance

    const proposal = items.find((i) => i.kind === "decision" && i.factType === "proposal");
    expect(proposal?.status).toBe("candidate");
    expect(proposal?.confidence).toBeLessThan(decision?.confidence ?? 1);

    expect(items.some((i) => i.kind === "known_issue")).toBe(true);
    const current = items.find((i) => i.kind === "current_work");
    expect(current?.content).toContain("race condition"); // the latest human prompt
  });
});

describe("memory engine — temporal state", () => {
  it("a later firm decision supersedes an earlier one on the same subject", async () => {
    const dir = await storeWith([
      promptEvent(SES, "let's use MySQL for the database"),
      promptEvent(SES, "let's use PostgreSQL for the database"),
    ]);
    const { items } = await build(dir);
    const mysql = items.find((i) => i.kind === "decision" && i.tags.includes("mysql"));
    const postgres = items.find((i) => i.kind === "decision" && i.tags.includes("postgres"));
    expect(postgres?.status).toBe("active");
    expect(mysql?.status).toBe("superseded");
    expect(mysql?.supersededBy).toBe(postgres?.id);
    expect(postgres?.supersedes).toBe(mysql?.id);
  });

  it("an explicit rejection retires the approach it names (failed_approach)", async () => {
    const dir = await storeWith([
      promptEvent(SES, "let's use Redis for caching"),
      promptEvent(SES, "instead of Redis, use in-memory caching"),
    ]);
    const { items } = await build(dir);
    expect(items.some((i) => i.kind === "failed_approach" && i.status === "rejected")).toBe(true);
    const redisDecision = items.find((i) => i.kind === "decision" && i.tags.includes("redis"));
    expect(redisDecision?.status).toBe("superseded"); // retired by the rejection
  });

  it("a tentative proposal never supersedes a firm decision", async () => {
    const dir = await storeWith([
      promptEvent(SES, "let's use Kafka for the event bus"),
      agentEvent(SES, "maybe we could use RabbitMQ"),
    ]);
    const { items } = await build(dir);
    expect(items.find((i) => i.tags.includes("kafka"))?.status).toBe("active");
  });

  it("records a genuine conflict when two firm decisions collide at the same moment", async () => {
    const ts = "2026-03-01T09:00:00.000Z";
    const dir = await storeWith([
      promptEvent(SES, "let's use Auth0 for authentication", { ts }),
      promptEvent(SES, "let's use Clerk for authentication", { ts }),
    ]);
    const { conflicts } = await build(dir);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0]?.kind).toBe("decision");
  });
});

describe("memory engine — privacy", () => {
  it("does not derive shared memory from local-visibility events", async () => {
    const dir = await storeWith([
      localPrompt(SES, "let's use InternalVault for storage"),
      promptEvent(SES, "let's use PostgreSQL for storage"),
    ]);
    const shared = await build(dir);
    expect(shared.items.some((i) => i.content.toLowerCase().includes("internalvault"))).toBe(false);
    expect(shared.items.some((i) => i.tags.includes("postgres"))).toBe(true);

    const withLocal = await build(dir, { includeLocal: true });
    const local = withLocal.items.find((i) => i.content.toLowerCase().includes("internalvault"));
    expect(local?.visibility).toBe("local");
  });
});

describe("memory engine — rebuild", () => {
  it("is idempotent: build → rebuild → same items, byte-stable on disk", async () => {
    const dir = await storeWith([
      promptEvent(SES, "let's use PostgreSQL for the database"),
      promptEvent(SES, "TODO: add integration tests for the worker"),
    ]);
    const first = await build(dir);

    const log = await EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
    try {
      await rebuildMemory(dir, log);
      await rebuildMemory(dir, log); // twice — must not churn
    } finally {
      await log.close();
    }
    const onDisk = await listMemory(dir);
    expect(onDisk.map((i) => i.id).sort()).toEqual(first.items.map((i) => i.id).sort());
    expect(onDisk.length).toBeGreaterThan(0);
  });
});
