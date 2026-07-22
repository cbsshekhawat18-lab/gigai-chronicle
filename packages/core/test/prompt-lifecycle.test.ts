/**
 * The prompt lifecycle (v0.1.1): notes (per-version "commit messages"),
 * revert (append-only rollback), and DERIVED usage — a library prompt is
 * "used" only when capture observed its text submitted (the ADR-0013 law
 * applied to the library: derived, never stored, impossible to fake by
 * clicking). Real EventLog + real files throughout.
 */
import { rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import type { SessionId } from "@gigaichronicle/schema";
import {
  EventLog,
  getPrompt,
  promptHistory,
  promptUsage,
  revertPrompt,
  savePrompt,
} from "../src/index.js";
import { WORKSPACE, makeTempChronicleDir, promptEvent } from "./helpers/events.js";

const SES = "ses_01ARZ3NDEKTSV4RRFFQ69G5FA0" as SessionId;

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = makeTempChronicleDir("chronicle-lifecycle-");
  dirs.push(dir);
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

async function seedCaptured(dir: string, texts: string[]): Promise<void> {
  await withLog(dir, async (log) => {
    await log.append(texts.map((text) => promptEvent(SES, text)));
  });
}

describe("version notes — the library's commit messages", () => {
  it("round-trips through save/parse and is NEVER inherited by later versions", async () => {
    const dir = tempDir();
    await savePrompt(dir, { slug: "audit", body: "v1 body", note: "first research draft" });
    await savePrompt(dir, { slug: "audit", body: "v2 body" });

    expect((await getPrompt(dir, "audit", 1)).note).toBe("first research draft");
    // A stale "why" on a later version would be a lie — v2 carries none.
    expect((await getPrompt(dir, "audit", 2)).note).toBeNull();
  });

  it("is the history preview when present; the body line is only the fallback", async () => {
    const dir = tempDir();
    await savePrompt(dir, { slug: "audit", body: "Do the thing.", note: "why: narrowed scope" });
    await savePrompt(dir, { slug: "audit", body: "Do the other thing." });

    const history = await promptHistory(dir, "audit"); // newest first
    expect(history[0]?.preview).toBe("Do the other thing.");
    expect(history[1]?.preview).toBe("why: narrowed scope");
    expect(history[1]?.note).toBe("why: narrowed scope");
  });

  it("multi-line notes are flattened to one line (frontmatter is line-based)", async () => {
    const dir = tempDir();
    await savePrompt(dir, { slug: "audit", body: "b", note: "line one\nline two" });
    expect((await getPrompt(dir, "audit", 1)).note).toBe("line one line two");
  });
});

describe("revert — rollback that never rewrites", () => {
  it("makes the old body the NEW current version; every step stays on disk", async () => {
    const dir = tempDir();
    await savePrompt(dir, { slug: "audit", body: "good version" });
    await savePrompt(dir, { slug: "audit", body: "worse version" });

    const reverted = await revertPrompt(dir, "audit", 1);
    expect(reverted.version).toBe(3);
    expect(reverted.body).toBe("good version");
    expect(reverted.note).toBe("revert to v1");
    // The detour is history, not erased.
    expect((await getPrompt(dir, "audit", 2)).body).toBe("worse version");
  });

  it("refuses a no-op revert with a clear error", async () => {
    const dir = tempDir();
    await savePrompt(dir, { slug: "audit", body: "only version" });
    await expect(revertPrompt(dir, "audit", 1)).rejects.toThrow(/already at v1/);
  });
});

describe("derived usage — used vs saved for later", () => {
  it("a research prompt capture never saw is ○ saved; a submitted one is ● used", async () => {
    const dir = tempDir();
    await savePrompt(dir, { slug: "research", body: "Never submitted anywhere." });
    await savePrompt(dir, { slug: "live", body: "Audit this module for races." });
    await seedCaptured(dir, ["Audit this module for races.", "unrelated prompt"]);

    const usage = await withLog(dir, (log) => promptUsage(dir, log));
    expect(usage.get("research")).toMatchObject({ status: "saved", total: 0, lastUsedTs: null });
    expect(usage.get("live")).toMatchObject({ status: "used", total: 1 });
    expect(usage.get("live")?.uses[0]?.session).toBe(SES);
  });

  it("attributes each use to the version whose body matched — per-version truth", async () => {
    const dir = tempDir();
    await savePrompt(dir, { slug: "audit", body: "version one text" });
    await savePrompt(dir, { slug: "audit", body: "version two text" });
    // v1 used twice, v2 once — "the new version isn't winning" is visible.
    await seedCaptured(dir, ["version one text", "version one text", "version two text"]);

    const info = (await withLog(dir, (log) => promptUsage(dir, log))).get("audit");
    expect(info?.total).toBe(3);
    expect(info?.byVersion).toEqual([
      { version: 1, count: 2 },
      { version: 2, count: 1 },
    ]);
  });

  it("credits EVERY prompt whose body matches — two slugs can share text, both are used", async () => {
    const dir = tempDir();
    await savePrompt(dir, { slug: "alpha", body: "Refactor this function for clarity." });
    await savePrompt(dir, { slug: "zebra", body: "Refactor this function for clarity." }); // identical body
    await seedCaptured(dir, ["Refactor this function for clarity."]);

    const usage = await withLog(dir, (log) => promptUsage(dir, log));
    // Neither may be dropped to "saved" just because it lost a slug-sort race.
    expect(usage.get("alpha")).toMatchObject({ status: "used", total: 1 });
    expect(usage.get("zebra")).toMatchObject({ status: "used", total: 1 });
  });

  it("twin bodies (a revert) attribute to the NEWEST matching version", async () => {
    const dir = tempDir();
    await savePrompt(dir, { slug: "audit", body: "the good text" });
    await savePrompt(dir, { slug: "audit", body: "a detour" });
    await revertPrompt(dir, "audit", 1); // v3 = v1's body
    await seedCaptured(dir, ["the good text"]);

    const info = (await withLog(dir, (log) => promptUsage(dir, log))).get("audit");
    expect(info?.uses[0]?.version).toBe(3);
  });

  it("matches across CRLF and outer whitespace, but never across edits", async () => {
    const dir = tempDir();
    await savePrompt(dir, { slug: "audit", body: "line a\nline b" });
    await seedCaptured(dir, ["line a\r\nline b\n", "line a\nline b EDITED"]);

    const info = (await withLog(dir, (log) => promptUsage(dir, log))).get("audit");
    // The CRLF variant is the same prompt; the edited one honestly is not.
    expect(info?.total).toBe(1);
  });

  it("a promoted prompt is born used, even before any post-save capture", async () => {
    const dir = tempDir();
    await savePrompt(dir, { slug: "kept", body: "text never re-submitted", sourceSession: SES });

    const usage = await withLog(dir, (log) => promptUsage(dir, log));
    expect(usage.get("kept")?.status).toBe("used");
    expect(usage.get("kept")?.total).toBe(0); // count stays honest: zero observed uses
  });
});
