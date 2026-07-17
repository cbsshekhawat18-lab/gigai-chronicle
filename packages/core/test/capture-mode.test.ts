/**
 * Consent gate 1 (ADR-0015): `capture.mode: "metadata"` must mean no prompt
 * text reaches disk — the promise `chronicle init --metadata-only` makes and,
 * before this, did not keep.
 *
 * These tests assert against the BYTES ON DISK, not the engine's return
 * value. The bug was never in what the engine said; it was in what the file
 * contained.
 */
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { rmSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  EventEngine,
  METADATA_ONLY_MARKER,
  captureModeOf,
  fixedGitReader,
  stripTextBodies,
} from "../src/index.js";
import type { SessionId } from "@gigaichronicle/schema";
import { WORKSPACE, makeTempChronicleDir } from "./helpers/events.js";

const SECRET = "Our unannounced Q4 acquisition target is Acme Corp";
const SESSION = "ses_01ARZ3NDEKTSV4RRFFQ69G5FA0" as SessionId;

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A store whose config declares `mode`, exactly as `chronicle init` writes it. */
async function storeWithMode(mode: "full" | "metadata" | undefined): Promise<string> {
  const dir = makeTempChronicleDir("chronicle-mode-");
  dirs.push(dir);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "config.json"),
    JSON.stringify({
      version: 1,
      project: { id: "prj_01ARZ3NDEKTSV4RRFFQ69G5FAV", name: "t" },
      capture: {
        providers: { "claude-code": "auto" },
        ...(mode !== undefined ? { mode } : {}),
        redaction: { secrets: true, customPatterns: [] },
        visibility: "shared",
        gitTrailer: false,
      },
      storage: { digest: { session: false }, retention: { mode: "keep-all" } },
    }),
    "utf8",
  );
  return dir;
}

/**
 * Emit a real prompt through the real engine, opened the way every provider
 * opens it — with NO captureMode option.
 *
 * Asserts the event was accepted: PromptSubmitted has sessionBinding
 * "required", so an emit without a session silently becomes a CaptureGap and
 * writes no text — which would make a "no text on disk" assertion pass for
 * entirely the wrong reason.
 */
async function emitPrompt(dir: string, text: string): Promise<void> {
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
    expect(result.accepted, `emit rejected: ${JSON.stringify(result)}`).toBe(true);
  } finally {
    await engine.close();
  }
}

/**
 * Every byte under the store — streams, blob sidecars, digests, all of it.
 * A privacy claim is about what is on disk ANYWHERE, so this deliberately
 * walks the whole tree rather than the file we expect to find it in.
 */
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

describe("capture.mode: metadata — consent gate 1", () => {
  it("keeps the promise: prompt text NEVER reaches disk", async () => {
    const dir = await storeWithMode("metadata");
    await emitPrompt(dir, `${SECRET} — draft the memo`);

    const bytes = await storeBytes(dir);
    expect(bytes).not.toContain("Acme Corp"); // the whole point
    expect(bytes).not.toContain(SECRET);
    expect(bytes).toContain(METADATA_ONLY_MARKER);
    // Shape survives — the mode is an audit trail without the words.
    expect(bytes).toContain("PromptSubmitted");
  });

  it("full mode (and absent mode) still capture text — no silent regression", async () => {
    const full = await storeWithMode("full");
    await emitPrompt(full, `${SECRET} — draft the memo`);
    expect(await storeBytes(full)).toContain("Acme Corp");

    // Absent → "full" is the schema's documented default.
    const absent = await storeWithMode(undefined);
    await emitPrompt(absent, `${SECRET} — draft the memo`);
    expect(await storeBytes(absent)).toContain("Acme Corp");
  });

  it("the gate is read from the store, so no caller can forget it", async () => {
    // The regression that started this: the engine is opened with NO mode
    // option at all — exactly how every provider calls it — and the gate
    // must still hold.
    const dir = await storeWithMode("metadata");
    await emitPrompt(dir, SECRET); // emitPrompt passes no captureMode
    expect(await storeBytes(dir)).not.toContain("Acme Corp");
  });

  it("captureModeOf reads the config, and fails to 'full' only when unreadable", async () => {
    expect(await captureModeOf(await storeWithMode("metadata"))).toBe("metadata");
    expect(await captureModeOf(await storeWithMode("full"))).toBe("full");
    expect(await captureModeOf(await storeWithMode(undefined))).toBe("full");
    expect(await captureModeOf("/no/such/dir")).toBe("full");
  });

  it("a config too broken to schema-validate can still say metadata", async () => {
    // Failing open on the privacy gate because an unrelated field rotted
    // would be this same bug in a new costume.
    const dir = makeTempChronicleDir("chronicle-mode-broken-");
    dirs.push(dir);
    await writeFile(
      path.join(dir, "config.json"),
      JSON.stringify({ capture: { mode: "metadata" }, garbage: true }),
      "utf8",
    );
    expect(await captureModeOf(dir)).toBe("metadata");
  });

  it("stripTextBodies removes the body and nothing else", () => {
    expect(stripTextBodies({ text: SECRET, tool: "Bash", ms: 12 })).toEqual({
      text: METADATA_ONLY_MARKER,
      tool: "Bash",
      ms: 12,
    });
    // Payloads with no text body are untouched — shapes are the point.
    expect(stripTextBodies({ tool: "Bash", outcome: "success" })).toEqual({
      tool: "Bash",
      outcome: "success",
    });
    expect(stripTextBodies(null)).toBeNull();
  });
});
