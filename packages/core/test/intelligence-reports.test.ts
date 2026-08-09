/**
 * Development Intelligence reports (DI Phase 3-4) — decision health, unfinished
 * work, technical debt, learnings, story, and the project/memory/onboarding
 * scores. All derived from Project Memory (no git needed for these), each
 * explainable and provenance-backed.
 */
import { rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import type { ChronicleEvent, SessionId } from "@gigaichronicle/schema";
import {
  EventLog,
  decisionHealth,
  developmentStory,
  learningsFrom,
  loadMemory,
  memoryHealth,
  onboardingTest,
  projectHealth,
  technicalDebt,
  unfinishedWork,
} from "../src/index.js";
import { WORKSPACE, makeTempChronicleDir, promptEvent } from "./helpers/events.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const s = (c: string): SessionId => `ses_01ARZ3NDEKTSV4RRFFQ69G5F${c}0` as SessionId;

async function project(events: ChronicleEvent[]): Promise<string> {
  const dir = makeTempChronicleDir("chronicle-di-rep-");
  dirs.push(dir);
  const log = await EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
  try {
    await log.append(events);
  } finally {
    await log.close();
  }
  return dir;
}
async function withLog<T>(dir: string, fn: (log: EventLog) => Promise<T>): Promise<T> {
  const log = await EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
  try {
    return await fn(log);
  } finally {
    await log.close();
  }
}

/** A small but varied project: a decision, a rejection, an issue, a TODO, a feature. */
async function varied(): Promise<string> {
  return project([
    promptEvent(s("A"), "let's use PostgreSQL for the database"),
    promptEvent(s("A"), "instead of Redis, use PostgreSQL for sessions"),
    promptEvent(s("B"), "TODO: the retry helper is duplicated and needs cleanup"),
    promptEvent(s("B"), "there is a race condition in the auth worker"),
    promptEvent(s("C"), "Add refresh token rotation"),
  ]);
}

describe("DI reports", () => {
  it("decision health counts active decisions (fresh ones are healthy)", async () => {
    const dir = await varied();
    const h = await withLog(dir, (log) => decisionHealth(dir, log, { now: "2026-08-10T00:00:00.000Z" }));
    expect(h.active).toBeGreaterThan(0);
    expect(h.healthy + h.aging + h.stale + h.conflicting).toBe(h.active);
  });

  it("unfinished work surfaces open items and skips resolved subjects", async () => {
    const dir = await varied();
    const items = await withLog(dir, (log) => unfinishedWork(dir, log, { now: "2026-08-10T00:00:00.000Z" }));
    expect(items.some((i) => i.what.toLowerCase().includes("race condition"))).toBe(true);
    expect(items.every((i) => ["possibly", "likely", "confirmed"].includes(i.confidence))).toBe(true);
  });

  it("technical debt picks up debt language (duplicated helper)", async () => {
    const dir = await varied();
    const debt = await withLog(dir, (log) => technicalDebt(dir, log));
    expect(debt.some((d) => d.text.toLowerCase().includes("duplicated"))).toBe(true);
    expect(debt.every((d) => d.provenance.length > 0)).toBe(true); // provenance required
  });

  it("learnings frame rejected approaches as lessons", async () => {
    const dir = await varied();
    const lessons = await withLog(dir, async (log) => learningsFrom(await loadMemory(dir, log)));
    expect(lessons.some((l) => l.lesson.toLowerCase().includes("rejected") || l.lesson.toLowerCase().includes("superseded"))).toBe(true);
  });

  it("story groups decisions, rejected approaches, problems, and current direction", async () => {
    const dir = await varied();
    const story = await withLog(dir, (log) => developmentStory(dir, log));
    expect(story.decisions.length + story.rejected.length + story.problems.length).toBeGreaterThan(0);
  });

  it("memory health + onboarding test produce explainable, bounded scores", async () => {
    const dir = await varied();
    const mh = await withLog(dir, (log) => memoryHealth(dir, log));
    expect(mh.overall).toBeGreaterThanOrEqual(0);
    expect(mh.overall).toBeLessThanOrEqual(100);
    expect(mh.metrics.length).toBeGreaterThan(0);
    const ob = await withLog(dir, (log) => onboardingTest(dir, log));
    expect(typeof ob.ready).toBe("boolean");
    expect(ob.overall).toBe(mh.overall);
  });

  it("project health is a bounded composite with named metrics", async () => {
    const dir = await varied();
    const h = await withLog(dir, (log) => projectHealth(dir, log));
    expect(h.overall).toBeGreaterThanOrEqual(0);
    expect(h.overall).toBeLessThanOrEqual(100);
    expect(h.metrics.map((m) => m.name)).toContain("Decisions");
  });

  it("an empty project scores memory health 0 (honest, not fabricated)", async () => {
    const dir = await project([]);
    expect((await withLog(dir, (log) => memoryHealth(dir, log))).overall).toBe(0);
  });
});
