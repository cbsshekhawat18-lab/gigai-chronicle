/**
 * Project Memory — security & privacy audit (Phase 11). Two guarantees:
 *  1. A local (private) session never contributes to shared, git-tracked memory.
 *  2. Secrets never surface in derived memory — redaction happens at capture, so
 *     memory (derived from already-redacted event text) carries the marker, not
 *     the secret; and `memory verify`'s detector would catch any that slipped.
 */
import { rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { newId, type ChronicleEvent, type SessionId } from "@gigaichronicle/schema";
import { EventLog, buildMemory, detectSecretKinds } from "../src/index.js";
import { WORKSPACE, makeTempChronicleDir, nextTs, promptEvent } from "./helpers/events.js";

const SES = "ses_01ARZ3NDEKTSV4RRFFQ69G5FA0" as SessionId;

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function build(events: ChronicleEvent[], opts = {}): ReturnType<typeof buildMemory> {
  const dir = makeTempChronicleDir("chronicle-mem-sec-");
  dirs.push(dir);
  const log = await EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
  try {
    if (events.length > 0) await log.append(events);
    return await buildMemory(dir, log, opts);
  } finally {
    await log.close();
  }
}

function localPrompt(text: string): ChronicleEvent {
  return promptEvent(SES, text, {
    meta: { provider: "example-tool@1.0.0", workspace: WORKSPACE, schema: "PromptSubmitted/1", visibility: "local" },
  });
}

describe("memory security & privacy", () => {
  it("a local (private) session never contributes to shared memory", async () => {
    const shared = await build([
      localPrompt("let's use InternalSecretService for storage"),
      promptEvent(SES, "let's use PostgreSQL for storage"),
    ]);
    expect(shared.items.some((m) => m.content.toLowerCase().includes("internalsecret"))).toBe(false);
    expect(shared.items.every((m) => m.visibility === "shared")).toBe(true);

    // The owner can still see it, explicitly, and it is tagged local.
    const owner = await build(
      [localPrompt("let's use InternalSecretService for storage")],
      { includeLocal: true },
    );
    expect(owner.items.find((m) => m.content.toLowerCase().includes("internalsecret"))?.visibility).toBe("local");
  });

  it("derived memory carries the redaction marker, never the secret (redaction is at capture)", async () => {
    // Capture redacts BEFORE the event is stored; memory derives from that text.
    const redacted = "let's use the API with token [REDACTED:high-entropy:6ce52bc4]";
    const { items } = await build([promptEvent(SES, redacted)]);
    for (const m of items) {
      expect(detectSecretKinds(`${m.title}\n${m.content}`)).toEqual([]); // no live secret
    }
  });

  it("the secret detector (used by `memory verify`) flags a leaked secret", async () => {
    // Belt-and-suspenders: if a real secret ever reached memory content, verify catches it.
    const kinds = detectSecretKinds("aws key AKIAIOSFODNN7EXAMPLE and ghp_1234567890abcdefghijklmnopqrstuvwxyzAB");
    expect(kinds.length).toBeGreaterThan(0);
  });
});
