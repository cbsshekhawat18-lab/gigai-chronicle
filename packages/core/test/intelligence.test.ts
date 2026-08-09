/**
 * Development Intelligence (DI Phase 1–2) — explainable risk scoring, negative
 * knowledge, and repeated-mistake detection. Deterministic, model-free.
 *
 * Risk scoring is tested via the PURE `riskSignals` (no git needed); repeated-
 * mistake detection is tested end-to-end from seeded events. The git-attribution
 * path for `risk`/`why-not` is exercised by the CLI golden workflow.
 */
import { rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { newId, type ChronicleEvent, type SessionId } from "@gigaichronicle/schema";
import {
  EventLog,
  levelOf,
  repeatedProblems,
  riskSignals,
  scoreOf,
  type FileEvidence,
  type MemoryItem,
} from "../src/index.js";
import { WORKSPACE, makeTempChronicleDir, nextTs, promptEvent } from "./helpers/events.js";

function mem(kind: MemoryItem["kind"], status: MemoryItem["status"], content: string): MemoryItem {
  return {
    id: `mem_${content.slice(0, 6).padEnd(12, "0")}`,
    schemaVersion: 1,
    kind,
    title: content,
    content,
    status,
    factType: kind === "decision" ? "decision" : "fact",
    confidence: 0.8,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    sourceRefs: [{ session: "ses_x", event: "evt_x" }],
    relatedFiles: [],
    relatedEvents: [],
    relatedSessions: ["ses_x"],
    supersedes: null,
    supersededBy: null,
    tags: [],
    visibility: "shared",
  };
}

describe("intelligence — explainable risk scoring", () => {
  it("sums named signals with provenance; a fragile file scores HIGH", () => {
    const evidence: FileEvidence = {
      file: "src/auth/token.ts",
      shapingPrompts: 12,
      sessions: ["ses_1", "ses_2"],
      churn: 500,
      memory: [
        mem("failed_approach", "rejected", "Redis for sessions"),
        mem("decision", "superseded", "MySQL"),
        mem("decision", "active", "PostgreSQL is the source of truth"),
        mem("constraint", "active", "tokens must be hashed"),
        mem("known_issue", "active", "refresh-token race condition"),
      ],
    };
    const signals = riskSignals(evidence);
    const codes = signals.map((s) => s.code);
    expect(codes).toContain("prior-failures");
    expect(codes).toContain("active-decision");
    expect(codes).toContain("known-issues");
    expect(codes).toContain("high-change-frequency");
    expect(codes).toContain("high-churn");
    // Explainable: every signal carries a weight and a human detail.
    expect(signals.every((s) => s.weight > 0 && s.detail.length > 0)).toBe(true);
    const score = scoreOf(signals);
    expect(score).toBeGreaterThanOrEqual(67);
    expect(levelOf(score)).toBe("high");
  });

  it("a file with no adverse history scores LOW with no signals", () => {
    const evidence: FileEvidence = { file: "src/util/format.ts", shapingPrompts: 1, sessions: ["ses_1"], churn: 10, memory: [] };
    const signals = riskSignals(evidence);
    expect(signals).toEqual([]);
    expect(levelOf(scoreOf(signals))).toBe("low");
  });
});

describe("intelligence — repeated-mistake detection", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });
  async function withEvents(events: ChronicleEvent[]): Promise<string> {
    const dir = makeTempChronicleDir("chronicle-intel-");
    dirs.push(dir);
    const log = await EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
    try {
      if (events.length > 0) await log.append(events);
    } finally {
      await log.close();
    }
    return dir;
  }
  async function repeat(dir: string, opts = {}): ReturnType<typeof repeatedProblems> {
    const log = await EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
    try {
      return await repeatedProblems(dir, log, opts);
    } finally {
      await log.close();
    }
  }
  const s = (c: string): SessionId => `ses_01ARZ3NDEKTSV4RRFFQ69G5F${c}0` as SessionId;

  it("flags a problem recurring across ≥2 sessions, unresolved", async () => {
    const dir = await withEvents([
      promptEvent(s("A"), "Fix the authentication race condition"),
      promptEvent(s("B"), "Fix the authentication race condition"),
      promptEvent(s("C"), "Still seeing the authentication race condition"),
    ]);
    const problems = await repeat(dir);
    const race = problems.find((p) => p.subject.includes("condition"));
    expect(race).toBeDefined();
    expect(race?.sessions.length).toBeGreaterThanOrEqual(2);
    expect(race?.resolved).toBe(false);
  });

  it("does not flag a single-session iteration, and marks resolved when fixed later", async () => {
    const single = await withEvents([
      promptEvent(s("A"), "Fix the payment webhook idempotency"),
      promptEvent(s("A"), "Fix the payment webhook idempotency"), // same session
    ]);
    expect(await repeat(single)).toHaveLength(0);

    const fixed = await withEvents([
      promptEvent(s("A"), "Fix the payment webhook idempotency"),
      promptEvent(s("B"), "Fix the payment webhook idempotency"),
      promptEvent(s("C"), "payment webhook idempotency resolved and passing"),
    ]);
    const problems = await repeat(fixed);
    expect(problems.find((p) => p.subject.includes("idempotency"))?.resolved).toBe(true);
  });

  it("--task filters to matching subjects", async () => {
    const dir = await withEvents([
      promptEvent(s("A"), "Fix the authentication race condition"),
      promptEvent(s("B"), "Fix the authentication race condition"),
      promptEvent(s("A"), "Fix the payment webhook retry"),
      promptEvent(s("B"), "Fix the payment webhook retry"),
    ]);
    const authOnly = await repeat(dir, { task: "authentication" });
    expect(authOnly.length).toBe(1);
    expect(authOnly[0]?.subject).toContain("authentication");
  });
});
