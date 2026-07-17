/**
 * The prompt seam (ADR-0014): a prompt you already typed can be promoted
 * into the library without retyping. Real EventLog throughout — these
 * lookups exist precisely so the extension can use them without SQLite
 * (ADR-0008), so an index-backed test would prove the wrong thing.
 */
import { rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import type { SessionId } from "@gigaichronicle/schema";
import {
  EventLog,
  capturedPromptByEvent,
  capturedPrompts,
  lastCapturedPrompt,
  suggestSlug,
} from "../src/index.js";
import { WORKSPACE, makeTempChronicleDir, promptEvent } from "./helpers/events.js";

const SES_A = "ses_01ARZ3NDEKTSV4RRFFQ69G5FA0" as SessionId;
const SES_B = "ses_01ARZ3NDEKTSV4RRFFQ69G5FB1" as SessionId;

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A store holding the given prompt events. */
async function storeWith(events: ReturnType<typeof promptEvent>[]): Promise<string> {
  const dir = makeTempChronicleDir("chronicle-seam-");
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

describe("promoting a captured prompt (the seam)", () => {
  it("finds every captured prompt, oldest first, with its provenance", async () => {
    const dir = await storeWith([promptEvent(SES_A, "first prompt"), promptEvent(SES_A, "second prompt")]);
    const found = await withLog(dir, (log) => capturedPrompts(dir, log));

    expect(found.map((p) => p.text)).toEqual(["first prompt", "second prompt"]);
    expect(found[0]?.eventId).toMatch(/^evt_/);
    expect(found[0]?.session).toBe(SES_A); // provenance rides along, free
  });

  it("--from-last promotes the prompt you just typed", async () => {
    const dir = await storeWith([promptEvent(SES_A, "old one"), promptEvent(SES_A, "the one that worked")]);
    const last = await withLog(dir, (log) => lastCapturedPrompt(dir, log));
    expect(last?.text).toBe("the one that worked");
  });

  it("--from-session scopes to one session's last prompt", async () => {
    const dir = await storeWith([
      promptEvent(SES_A, "session A first"),
      promptEvent(SES_B, "session B only"),
      promptEvent(SES_A, "session A last"),
    ]);
    const a = await withLog(dir, (log) => lastCapturedPrompt(dir, log, { session: SES_A }));
    const b = await withLog(dir, (log) => lastCapturedPrompt(dir, log, { session: SES_B }));
    expect(a?.text).toBe("session A last");
    expect(b?.text).toBe("session B only");
  });

  it("--from-event resolves one prompt by id", async () => {
    const alpha = promptEvent(SES_A, "alpha");
    const dir = await storeWith([alpha, promptEvent(SES_A, "beta")]);
    const found = await withLog(dir, (log) => capturedPromptByEvent(dir, log, alpha.id));
    expect(found?.text).toBe("alpha");
    expect(found?.eventId).toBe(alpha.id);
  });

  it("unknown event id, and a store with no prompts, return null — never throw", async () => {
    const dir = await storeWith([promptEvent(SES_A, "only one")]);
    expect(
      await withLog(dir, (log) => capturedPromptByEvent(dir, log, "evt_01ZZZZZZZZZZZZZZZZZZZZZZZZ")),
    ).toBeNull();

    const empty = await storeWith([]);
    expect(await withLog(empty, (log) => lastCapturedPrompt(empty, log))).toBeNull();
    expect(await withLog(empty, (log) => capturedPrompts(empty, log))).toEqual([]);
  });

  it("a >64KB prompt spilled to a blob is still promotable — the long ones matter most", async () => {
    // text is textOrBlobSchema: past 64KB the body becomes a {$blob} ref
    // (§7.2 rule 5). Treating that as "no text" would silently drop exactly
    // the carefully-built prompts a library exists for.
    const huge = "Review this service.\n".repeat(4_000); // ~84KB
    expect(Buffer.byteLength(huge, "utf8")).toBeGreaterThan(64 * 1024);

    const dir = makeTempChronicleDir("chronicle-seam-blob-");
    dirs.push(dir);
    const log = await EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
    try {
      await log.append([promptEvent(SES_A, huge)]); // append spills it
    } finally {
      await log.close();
    }

    const found = await withLog(dir, (log) => capturedPrompts(dir, log));
    expect(found).toHaveLength(1);
    expect(found[0]?.text).toBe(huge); // resolved from the sidecar, byte-exact
  });
});

describe("suggestSlug", () => {
  it("turns prompt text into a kebab-case starting point", () => {
    expect(suggestSlug("Review this middleware for token-handling flaws")).toBe(
      "review-this-middleware-for-token-handling-flaws",
    );
    expect(suggestSlug("Check   token rotation!!!", 3)).toBe("check-token-rotation");
  });

  it("survives text that has no usable characters", () => {
    expect(suggestSlug("!!! ???")).toBe("");
    expect(suggestSlug("")).toBe("");
  });

  it("never emits a leading/trailing dash or exceeds the slug limit", () => {
    const slug = suggestSlug("-- a very long prompt ".repeat(20), 40);
    expect(slug.length).toBeLessThanOrEqual(64);
    expect(slug.startsWith("-")).toBe(false);
    expect(slug.endsWith("-")).toBe(false);
    expect(slug).toMatch(/^[a-z0-9][a-z0-9-]*$/);
  });
});
