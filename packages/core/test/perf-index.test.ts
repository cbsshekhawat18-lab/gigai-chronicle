/**
 * The 100k-event fixture perf gates (perf/budgets.json, ARCHITECTURE §19):
 * index rebuild < 30s · month timeline < 100ms · FTS < 200ms.
 * The fixture generator here is the shared basis all later perf gates build
 * on (M4 epic: "shared by all perf gates").
 */
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newId, type ChronicleEvent, type SessionId } from "@gigaichronicle/schema";
import { ChronicleIndex, EventLog } from "../src/index.js";
import { WORKSPACE, makeTempChronicleDir } from "./helpers/events.js";

const budgets = (
  JSON.parse(
    readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../perf/budgets.json"),
      "utf8",
    ),
  ) as { fixture: { events: number }; budgets: Array<{ id: string; budgetMs: number | null }> }
);
const budget = (id: string): number =>
  budgets.budgets.find((b) => b.id === id)?.budgetMs as number;

const EVENT_COUNT = budgets.fixture.events; // 100_000
const SESSIONS = 200;
const MONTH_MS = 30 * 24 * 3600 * 1000;
const BASE_MS = Date.parse("2026-01-05T09:00:00.000Z");

function canonical(ms: number): string {
  return new Date(ms).toISOString().replace(/(\.\d{3})\d*Z$/, "$1Z");
}

function fixtureEvent(session: SessionId, ms: number, i: number): ChronicleEvent {
  return {
    v: 1,
    id: newId("event", ms),
    ts: canonical(ms),
    type: "PromptSubmitted",
    session,
    actor: { kind: "human" },
    git: { head: "9fc1b2a", branch: "main", dirty: [] },
    payload: { text: `fixture prompt ${i} about topic-${i % 997} rotation` },
    meta: {
      provider: "example-tool@1.0.0",
      workspace: WORKSPACE,
      schema: "PromptSubmitted/1",
      visibility: "shared",
    },
  } as ChronicleEvent;
}

describe("100k-event fixture budgets", () => {
  const dir = makeTempChronicleDir("chronicle-100k-");
  let log: EventLog;
  let index: ChronicleIndex;

  beforeAll(async () => {
    log = await EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
    const perSession = EVENT_COUNT / SESSIONS; // 500
    let generated = 0;
    for (let s = 0; s < SESSIONS; s++) {
      const monthMs = BASE_MS + (s % 12) * MONTH_MS;
      const session = newId("session", monthMs);
      const batch: ChronicleEvent[] = [];
      for (let i = 0; i < perSession; i++) {
        batch.push(fixtureEvent(session, monthMs + i * 1000, generated + i));
      }
      await log.append(batch);
      generated += perSession;
    }
    index = ChronicleIndex.open(dir);
  }, 240_000);

  afterAll(async () => {
    index?.close();
    await log?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it(
    "index rebuild of 100k events within budget",
    { timeout: 240_000 },
    async () => {
      const start = performance.now();
      const indexed = await index.rebuild(log);
      const elapsed = performance.now() - start;
      // eslint-disable-next-line no-console
      console.log(`rebuild: ${indexed} events in ${Math.round(elapsed)}ms`);
      expect(indexed).toBe(EVENT_COUNT);
      expect(elapsed).toBeLessThan(budget("index.rebuild.100k"));
    },
  );

  it("month timeline query within budget", () => {
    const from = canonical(BASE_MS + 2 * MONTH_MS);
    const to = canonical(BASE_MS + 3 * MONTH_MS - 1);
    const start = performance.now();
    const events = index.timeline({ from, to, limit: 20_000 });
    const elapsed = performance.now() - start;
    // eslint-disable-next-line no-console
    console.log(`month query: ${events.length} events in ${elapsed.toFixed(1)}ms`);
    expect(events.length).toBeGreaterThan(1000);
    expect(elapsed).toBeLessThan(budget("query.timeline.month-10k"));
  });

  it("full-text search over 100k events within budget", () => {
    const start = performance.now();
    const hits = index.search("topic-421 rotation");
    const elapsed = performance.now() - start;
    // eslint-disable-next-line no-console
    console.log(`fts: ${hits.length} hits in ${elapsed.toFixed(1)}ms`);
    expect(hits.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(budget("query.fts.100k"));
  });
});
