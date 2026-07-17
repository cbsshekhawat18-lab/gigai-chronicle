/**
 * `capture.redaction` is honored (ADR-0017) — the second fake feature found
 * by auditing every promise config makes after ADR-0015.
 *
 * `customPatterns` was defined in the schema, written by `init`, and read by
 * NOTHING: an org that added its own token shape got zero redaction and its
 * secrets went to disk in plain text. Same shape as the inert metadata mode.
 *
 * These assert against the BYTES ON DISK. A redaction test that checks a
 * function's return value proves the function; only the file proves the
 * promise.
 */
import { rmSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { SessionId } from "@gigaichronicle/schema";
import { EventEngine, capturePolicyOf, createRedactor, fixedGitReader } from "../src/index.js";
import { WORKSPACE, makeTempChronicleDir } from "./helpers/events.js";

const SESSION = "ses_01ARZ3NDEKTSV4RRFFQ69G5FA0" as SessionId;
/** An org-internal token shape no built-in pattern pack could know. */
const ACME_TOKEN = "ACME-INTERNAL-9f3a2b1c";
/** A shape the built-in pack DOES know. */
const AWS_KEY = "AKIAIOSFODNN7EXAMPLE";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function storeWithRedaction(redaction: unknown): Promise<string> {
  const dir = makeTempChronicleDir("chronicle-redact-");
  dirs.push(dir);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "config.json"),
    JSON.stringify({
      version: 1,
      project: { id: "prj_01ARZ3NDEKTSV4RRFFQ69G5FAV", name: "t" },
      capture: {
        providers: { "claude-code": "auto" },
        redaction,
        visibility: "shared",
        gitTrailer: false,
      },
      storage: { digest: { session: false }, retention: { mode: "keep-all" } },
    }),
    "utf8",
  );
  return dir;
}

/** Emit through the real engine, opened the way every provider opens it. */
async function emit(dir: string, text: string): Promise<void> {
  const engine = await EventEngine.open(dir, {
    workspaceId: WORKSPACE,
    provider: { id: "test", version: "1" },
    gitReader: fixedGitReader({ head: null, branch: null, dirty: [] }),
    fsyncIntervalMs: 0,
  });
  try {
    const result = await engine.emit({
      type: "PromptSubmitted",
      session: SESSION,
      actor: { kind: "human" },
      payload: { text },
    });
    // PromptSubmitted requires a session; a dropped event would make every
    // "not on disk" assertion below pass against an empty file.
    expect(result.accepted, `emit rejected: ${JSON.stringify(result)}`).toBe(true);
  } finally {
    await engine.close();
  }
}

/** Every byte under the store. */
async function storeBytes(dir: string): Promise<string> {
  const parts: string[] = [];
  const walk = async (current: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true }).catch(() => [])) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name !== "config.json") parts.push(await readFile(full, "utf8").catch(() => ""));
    }
  };
  await walk(dir);
  return parts.join("\n");
}

describe("capture.redaction.customPatterns — the user's own secret shapes", () => {
  it("keeps the promise: a configured pattern never reaches disk", async () => {
    const dir = await storeWithRedaction({
      secrets: true,
      customPatterns: ["ACME-INTERNAL-[0-9a-f]+"],
    });
    await emit(dir, `deploy with ${ACME_TOKEN} please`);

    const bytes = await storeBytes(dir);
    expect(bytes).not.toContain(ACME_TOKEN); // the whole point
    expect(bytes).toContain("[REDACTED:custom:");
    expect(bytes).toContain("deploy with"); // surrounding content survives
  });

  it("without the pattern configured, the same token IS captured — proving the config did the work", async () => {
    // The control. Without it, the test above could pass because some other
    // rule happened to catch the token.
    const dir = await storeWithRedaction({ secrets: true, customPatterns: [] });
    await emit(dir, `deploy with ${ACME_TOKEN} please`);
    expect(await storeBytes(dir)).toContain(ACME_TOKEN);
  });

  it("an unparseable pattern is skipped, never thrown — a config typo must not break capture", async () => {
    const dir = await storeWithRedaction({
      secrets: true,
      customPatterns: ["ACME-INTERNAL-[0-9a-f]+", "((("], // second one is garbage
    });
    await emit(dir, `deploy with ${ACME_TOKEN} please`); // must not throw
    expect(await storeBytes(dir)).not.toContain(ACME_TOKEN); // the good one still works
  });
});

describe("capture.redaction.secrets — the built-in pack toggle", () => {
  it("true (or absent) redacts the built-in shapes", async () => {
    const dir = await storeWithRedaction({ secrets: true, customPatterns: [] });
    await emit(dir, `key is ${AWS_KEY}`);
    const bytes = await storeBytes(dir);
    expect(bytes).not.toContain(AWS_KEY);
    expect(bytes).toContain("[REDACTED:aws-access-key-id:");
  });

  it("false honors the user: the pack is off, and custom patterns still apply", async () => {
    // Turning the pack off is a real need — an irreversible false positive
    // corrupts content. Listing a custom pattern is still an explicit ask.
    const dir = await storeWithRedaction({
      secrets: false,
      customPatterns: ["ACME-INTERNAL-[0-9a-f]+"],
    });
    await emit(dir, `key ${AWS_KEY} token ${ACME_TOKEN}`);

    const bytes = await storeBytes(dir);
    expect(bytes).toContain(AWS_KEY); //          pack off, as asked
    expect(bytes).not.toContain(ACME_TOKEN); //   explicit ask still honored
  });
});

describe("capturePolicyOf", () => {
  it("reads redaction config, defaulting to MORE protection, never less", async () => {
    expect(await capturePolicyOf(await storeWithRedaction({ secrets: false, customPatterns: ["a"] })))
      .toMatchObject({ redaction: { secrets: false, customPatterns: ["a"] } });

    // Missing/garbage → protection stays ON. Failing open would be ADR-0015 again.
    expect((await capturePolicyOf(await storeWithRedaction({}))).redaction).toEqual({
      secrets: true,
      customPatterns: [],
    });
    expect(
      (await capturePolicyOf(await storeWithRedaction({ secrets: "yes", customPatterns: "nope" })))
        .redaction,
    ).toEqual({ secrets: true, customPatterns: [] });
    expect((await capturePolicyOf("/no/such/dir")).redaction).toEqual({
      secrets: true,
      customPatterns: [],
    });
  });

  it("non-string entries in customPatterns are dropped, not crashed on", async () => {
    const policy = await capturePolicyOf(
      await storeWithRedaction({ secrets: true, customPatterns: ["ok", 42, null] }),
    );
    expect(policy.redaction.customPatterns).toEqual(["ok"]);
  });
});

describe("createRedactor options (the unit beneath the promise)", () => {
  it("custom patterns run independently of the secret pack", () => {
    const only = createRedactor([], { secrets: false, customPatterns: ["SEK-\\d+"] });
    expect(only.redactText(`a SEK-123 ${AWS_KEY}`)).toContain("[REDACTED:custom:");
    expect(only.redactText(`a SEK-123 ${AWS_KEY}`)).toContain(AWS_KEY); // pack off
  });

  it("defaults are unchanged — existing callers keep full protection", () => {
    const legacy = createRedactor([]);
    expect(legacy.redactText(`key ${AWS_KEY}`)).not.toContain(AWS_KEY);
  });
});
