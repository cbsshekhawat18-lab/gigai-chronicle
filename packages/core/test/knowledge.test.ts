/**
 * Knowledge extraction: decisions & TODOs surfaced from prompts AND the
 * agent's responses, rule-based and model-free, with provenance + confidence.
 * The extraction is intentionally conservative — the false-positive cases here
 * are as important as the true positives (an honest index, not a guess).
 */
import { rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { newId, type ChronicleEvent, type SessionId } from "@gigaichronicle/schema";
import { EventLog, extractKnowledge } from "../src/index.js";
import { WORKSPACE, makeTempChronicleDir, nextTs, promptEvent } from "./helpers/events.js";

const SES = "ses_01ARZ3NDEKTSV4RRFFQ69G5FA0" as SessionId;
const OTHER = "ses_01ARZ3NDEKTSV4RRFFQ69G5FB1" as SessionId;

/** An agent-authored response — decisions & TODOs live here too. */
function responseEvent(session: SessionId, text: string): ChronicleEvent {
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

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function storeWith(events: ChronicleEvent[]): Promise<string> {
  const dir = makeTempChronicleDir("chronicle-knowledge-");
  dirs.push(dir);
  const log = await EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
  try {
    if (events.length > 0) await log.append(events);
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

describe("knowledge — decisions", () => {
  it("finds a decision in a prompt AND in a response, tagged by role, with provenance", async () => {
    const dir = await storeWith([
      promptEvent(SES, "let's use zustand for state"),
      responseEvent(SES, "I'll go with a JSONL store here."),
      promptEvent(SES, "just some chatter, nothing to decide here"),
    ]);
    const decisions = (await withLog(dir, (log) => extractKnowledge(dir, log))).filter((i) => i.kind === "decision");
    expect(decisions.map((d) => d.text)).toEqual(["let's use zustand for state", "I'll go with a JSONL store here."]);
    expect(decisions[0]?.role).toBe("human");
    expect(decisions[1]?.role).toBe("agent");
    expect(decisions[0]?.eventId).toMatch(/^evt_/);
    expect(decisions[0]?.confidence).toBe("high");
  });
});

describe("knowledge — todos", () => {
  it("finds markers (high) and phrasings (medium), tiering confidence", async () => {
    const dir = await storeWith([
      promptEvent(SES, "TODO: handle the empty case"),
      responseEvent(SES, "we should add a test for this"),
    ]);
    const todos = (await withLog(dir, (log) => extractKnowledge(dir, log))).filter((i) => i.kind === "todo");
    expect(todos).toHaveLength(2);
    expect(todos.find((t) => t.text.includes("TODO"))?.confidence).toBe("high");
    expect(todos.find((t) => t.text.includes("we should"))?.confidence).toBe("medium");
  });
});

describe("knowledge — honesty (does NOT fire on conversation)", () => {
  it("ignores the phrasings that were false positives on real data", async () => {
    const dir = await storeWith([
      responseEvent(SES, "I'll keep an eye on the namespace status."),
      responseEvent(SES, "I'll follow up automatically when CI finishes."),
      promptEvent(SES, "which things we need to show in the banner"),
    ]);
    expect(await withLog(dir, (log) => extractKnowledge(dir, log))).toEqual([]);
  });
});

describe("knowledge — dedup + filters", () => {
  it("dedups an identical repeated line, and filters by kind and session", async () => {
    const dir = await storeWith([
      promptEvent(SES, "let's use react query"),
      promptEvent(SES, "let's use react query"),
      promptEvent(OTHER, "let's use redux instead"),
      promptEvent(SES, "TODO: wire the cache"),
    ]);
    const all = await withLog(dir, (log) => extractKnowledge(dir, log));
    expect(all.filter((i) => i.text.includes("react query"))).toHaveLength(1); // deduped

    const scoped = await withLog(dir, (log) => extractKnowledge(dir, log, { session: SES }));
    expect(scoped.every((i) => i.session === SES)).toBe(true);
    expect(scoped.some((i) => i.text.includes("redux"))).toBe(false);

    const onlyTodos = await withLog(dir, (log) => extractKnowledge(dir, log, { kind: "todo" }));
    expect(onlyTodos.length).toBeGreaterThan(0);
    expect(onlyTodos.every((i) => i.kind === "todo")).toBe(true);
  });
});

describe("knowledge — review hardening (negation, ordering, scope, blobs)", () => {
  it("guards negated & interrogative lines — a rejection is never surfaced as a decision", async () => {
    const dir = await storeWith([
      responseEvent(SES, "I haven't decided to drop the cache yet."),
      responseEvent(SES, "We are not going with Redis after all."),
      promptEvent(SES, "Are you going with Postgres?"),
      promptEvent(SES, "I don't think we should use a queue here."),
    ]);
    // Every line matches a rule textually, but negation/question voids it.
    expect(await withLog(dir, (log) => extractKnowledge(dir, log))).toEqual([]);
  });

  it("an authored TODO marker survives even inside a negation ('don't')", async () => {
    const dir = await storeWith([promptEvent(SES, "TODO: don't forget to add retries")]);
    const todos = await withLog(dir, (log) => extractKnowledge(dir, log));
    expect(todos).toHaveLength(1);
    expect(todos[0]).toMatchObject({ kind: "todo", confidence: "high" });
  });

  it("a line with both signals is classified by the stronger one (high TODO beats medium decision)", async () => {
    const dir = await storeWith([promptEvent(SES, "The plan is to add a TODO for retries")]);
    const [item] = await withLog(dir, (log) => extractKnowledge(dir, log));
    expect(item).toMatchObject({ kind: "todo", confidence: "high" });
  });

  it("scoped extraction is not suppressed by an identical line in an unrelated, earlier-scanned session", async () => {
    // UNREL sorts before WANT, so global dedup would keep UNREL's copy and a
    // post-filter would then drop the wanted session's decision entirely.
    const UNREL = "ses_01ARZ3NDEKTSV4RRFFQ69G5AAA" as SessionId;
    const WANT = "ses_01ARZ3NDEKTSV4RRFFQ69G5ZZZ" as SessionId;
    const dir = await storeWith([
      promptEvent(UNREL, "let's use JWT for auth"),
      promptEvent(WANT, "let's use JWT for auth"),
    ]);
    const scoped = await withLog(dir, (log) => extractKnowledge(dir, log, { sessions: [WANT] }));
    expect(scoped).toHaveLength(1);
    expect(scoped[0]).toMatchObject({ session: WANT, text: "let's use JWT for auth" });
  });

  it("dedups on the full line, not the display snippet — two long lines sharing a 199-char prefix stay distinct", async () => {
    const prefix = "let's use ".padEnd(210, "x"); // >200 chars, identical prefix
    const dir = await storeWith([
      promptEvent(SES, `${prefix} alpha`),
      promptEvent(SES, `${prefix} beta`),
    ]);
    const decisions = (await withLog(dir, (log) => extractKnowledge(dir, log))).filter(
      (i) => i.kind === "decision",
    );
    expect(decisions).toHaveLength(2); // not collapsed by snippet truncation
  });

  it("resolves a blob-spilled prompt (>64KB) so its decision is still surfaced", async () => {
    const big = `let's use zustand for state\n${"x".repeat(70 * 1024)}`;
    const dir = await storeWith([promptEvent(SES, big)]);
    const decisions = (await withLog(dir, (log) => extractKnowledge(dir, log))).filter(
      (i) => i.kind === "decision",
    );
    expect(decisions.map((d) => d.text)).toEqual(["let's use zustand for state"]);
  });
});
