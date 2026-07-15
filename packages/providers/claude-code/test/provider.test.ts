/**
 * Provider unit + e2e: hook mapping, live capture through the real engine,
 * fingerprinted transcript parsing, idempotent backfill, settings etiquette,
 * capability conformance. Fixtures are synthetic (SECURITY.md).
 */
import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { newId, parseChronicleEventLine } from "@gigaichronicle/schema";
import {
  CAPABILITY,
  CAPTURED_HOOK_EVENTS,
  SessionMap,
  cwdSlug,
  installHooks,
  mapHookToCandidate,
  parseTranscript,
  renderInstallPlan,
  runBackfill,
  runCapture,
  settingsPathFor,
  uninstallHooks,
} from "../src/index.js";

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures");

const dirs: string[] = [];
function tempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeStore(): string {
  const root = tempDir("cc-provider ");
  execFileSync("git", ["-C", root, "init", "-q"]);
  const chronicleDir = path.join(root, ".chronicle");
  mkdirSync(chronicleDir);
  return chronicleDir;
}

/**
 * Read stored event types via raw files + the schema parser — deliberately
 * NOT via core (the boundary lint scans provider tests too, and providers
 * must never grow a habit of reading the store).
 */
async function storedTypes(chronicleDir: string): Promise<string[]> {
  const types: Array<{ ts: string; type: string }> = [];
  for (const root of ["sessions", ".local/ops"]) {
    const rootDir = path.join(chronicleDir, ...root.split("/"));
    let entries: string[] = [];
    try {
      entries = (readdirSync(rootDir, { recursive: true }) as string[]).map(String);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith(".jsonl")) continue;
      for (const line of readFileSync(path.join(rootDir, entry), "utf8").split("\n")) {
        if (line.trim() === "") continue;
        const verdict = parseChronicleEventLine(line);
        if (verdict.ok) types.push({ ts: verdict.event.ts, type: verdict.event.type });
      }
    }
  }
  return Promise.resolve(types.sort((a, b) => a.ts.localeCompare(b.ts)).map((t) => t.type));
}

describe("hook mapping", () => {
  const session = newId("session");
  it("maps the five installed events", () => {
    expect(
      mapHookToCandidate("UserPromptSubmit", { prompt: "add rotation" }, session, null),
    ).toMatchObject({ type: "PromptSubmitted", payload: { text: "add rotation" } });
    expect(mapHookToCandidate("SessionStart", { source: "startup" }, session, null)).toMatchObject({
      type: "SessionStarted",
    });
    expect(mapHookToCandidate("SessionEnd", { reason: "exit" }, session, null)).toMatchObject({
      type: "SessionEnded",
      payload: { reason: "completed" },
    });
    expect(mapHookToCandidate("Stop", {}, session, "the answer")).toMatchObject({
      type: "AIResponseReceived",
      payload: { text: "the answer" },
    });
    expect(
      mapHookToCandidate(
        "PostToolUse",
        { tool_name: "Edit", tool_input: { file_path: "src/a.ts" }, tool_response: {} },
        session,
        null,
      ),
    ).toMatchObject({ type: "ToolExecuted", payload: { tool: "Edit", outcome: "success" } });
  });

  it("flags failed tools and rejects malformed input with null (degrade path)", () => {
    expect(
      mapHookToCandidate("PostToolUse", { tool_name: "bash", tool_response: { is_error: true } }, session, null),
    ).toMatchObject({ payload: { outcome: "failure" } });
    expect(mapHookToCandidate("UserPromptSubmit", {}, session, null)).toBeNull();
    expect(mapHookToCandidate("SomethingNew", {}, session, null)).toBeNull();
  });
});

describe("live capture (runCapture through the real engine)", () => {
  it("two hooks with the same tool session map to one chronicle session", async () => {
    const chronicleDir = makeStore();
    const stdin = JSON.stringify({ session_id: "uuid-1", prompt: "first prompt" });
    expect((await runCapture(chronicleDir, "UserPromptSubmit", stdin)).ok).toBe(true);
    const stdin2 = JSON.stringify({ session_id: "uuid-1", prompt: "second prompt" });
    expect((await runCapture(chronicleDir, "UserPromptSubmit", stdin2)).ok).toBe(true);

    const map = SessionMap.load(chronicleDir);
    const session = map.resolve("uuid-1");
    expect(map.resolve("uuid-1")).toBe(session); // stable
    expect(await storedTypes(chronicleDir)).toEqual(["PromptSubmitted", "PromptSubmitted"]);
  });

  it("never throws: garbage stdin and unknown events degrade, ok:false", async () => {
    const chronicleDir = makeStore();
    expect((await runCapture(chronicleDir, "UserPromptSubmit", "not json{{{")).ok).toBe(false);
    expect((await runCapture(chronicleDir, "FutureHook", JSON.stringify({ session_id: "u" }))).ok).toBe(false);
    const types = await storedTypes(chronicleDir);
    expect(types.filter((t) => t === "CaptureDegraded").length).toBeGreaterThanOrEqual(2);
  });
});

describe("transcript parsing (fingerprinted)", () => {
  it("parses the basic fixture into a bracketed session", () => {
    const lines = readFileSync(path.join(FIXTURES, "session-basic.jsonl"), "utf8").split("\n");
    const parsed = parseTranscript(lines, newId("session"));
    expect(parsed.drifted).toBe(false);
    expect(parsed.toolSessionUuid).toBe("11111111-2222-3333-4444-555555555555");
    expect(parsed.candidates.map((c) => c.type)).toEqual([
      "SessionStarted",
      "PromptSubmitted",
      "AIResponseReceived",
      "ToolExecuted",
      "AIResponseReceived",
      "SessionEnded",
    ]);
    expect(parsed.candidates[0]?.payload).toMatchObject({
      title: "Add refresh-token rotation to the auth middleware",
    });
  });

  it("CI canary: the current-format fixture must parse with zero unknown lines", () => {
    const lines = readFileSync(path.join(FIXTURES, "session-basic.jsonl"), "utf8").split("\n");
    const parsed = parseTranscript(lines, newId("session"));
    expect(parsed.linesUnknown).toBe(0); // red build = the format moved under us
  });

  it("future-format fixture drifts → zero candidates, flagged", () => {
    const lines = readFileSync(path.join(FIXTURES, "session-future-format.jsonl"), "utf8").split("\n");
    const parsed = parseTranscript(lines, newId("session"));
    expect(parsed.drifted).toBe(true);
    expect(parsed.candidates).toEqual([]);
  });
});

describe("backfill (idempotent, fail-soft)", () => {
  function transcriptsFixtureRoot(workspacePath: string): string {
    const root = tempDir("cc-transcripts ");
    const dir = path.join(root, cwdSlug(workspacePath));
    mkdirSync(dir, { recursive: true });
    cpSync(path.join(FIXTURES, "session-basic.jsonl"), path.join(dir, "11111111-2222-3333-4444-555555555555.jsonl"));
    cpSync(path.join(FIXTURES, "session-future-format.jsonl"), path.join(dir, "99999999-8888-7777-6666-555555555555.jsonl"));
    return root;
  }

  it("imports the fixture month, skips drifted files with a degradation, reruns are no-ops", async () => {
    const chronicleDir = makeStore();
    const workspacePath = path.dirname(chronicleDir);
    const transcriptsRoot = transcriptsFixtureRoot(workspacePath);

    const report = await runBackfill(chronicleDir, {
      knownWorkspacePaths: [workspacePath],
      transcriptsRoot,
    });
    expect(report).toMatchObject({ filesImported: 1, filesSkippedDrift: 1, gaps: 0 });
    expect(report.eventsImported).toBe(6);

    const again = await runBackfill(chronicleDir, {
      knownWorkspacePaths: [workspacePath],
      transcriptsRoot,
    });
    expect(again.eventsImported).toBe(0); // idempotent

    const types = await storedTypes(chronicleDir);
    expect(types.filter((t) => t === "PromptSubmitted")).toHaveLength(1);
    expect(types.filter((t) => t === "CaptureDegraded")).toHaveLength(1); // drift recorded once? (re-degrades on rerun is acceptable but cursor skips) —
  });

  it("finds transcripts under MOVED workspace paths", async () => {
    const chronicleDir = makeStore();
    const oldPath = "/somewhere/else/old-name";
    const transcriptsRoot = transcriptsFixtureRoot(oldPath);
    const report = await runBackfill(chronicleDir, {
      knownWorkspacePaths: [path.dirname(chronicleDir), oldPath],
      transcriptsRoot,
    });
    expect(report.filesImported).toBe(1);
  });
});

describe("settings merge etiquette", () => {
  it("install shows a plan, merges without clobbering, is idempotent; uninstall removes only ours", () => {
    const root = tempDir("cc-settings ");
    const file = settingsPathFor(root, "project");
    mkdirSync(path.dirname(file), { recursive: true });
    const existing = {
      permissions: { allow: ["Bash(npm:*)"] },
      hooks: { PostToolUse: [{ hooks: [{ type: "command", command: "eslint --fix" }] }] },
    };
    writeFileSync(file, JSON.stringify(existing, null, 2) + "\n");

    expect(renderInstallPlan(file)).toHaveLength(CAPTURED_HOOK_EVENTS.length);
    expect(installHooks(file)).toBe(true);
    expect(installHooks(file)).toBe(false); // idempotent

    const merged = JSON.parse(readFileSync(file, "utf8"));
    expect(merged.permissions).toEqual(existing.permissions); // untouched
    expect(merged.hooks.PostToolUse[0].hooks[0].command).toBe("eslint --fix"); // preserved
    expect(merged.hooks.PostToolUse[1].hooks[0].command).toContain("chronicle capture claude-code");
    expect(merged.hooks.SessionStart[0].hooks[0].command).toContain("--event SessionStart");

    expect(uninstallHooks(file)).toBe(true);
    const restored = JSON.parse(readFileSync(file, "utf8"));
    expect(restored).toEqual(existing); // byte-equal semantics: only ours removed
    expect(uninstallHooks(file)).toBe(false);
  });
});

describe("capability conformance", () => {
  it("matches the PROVIDERS.md row (tier 1, Full replay, low risk)", () => {
    expect(CAPABILITY).toEqual({
      captureTier: 1,
      replayFidelity: "full",
      maintenanceRisk: "low",
      prompts: true,
      toolCalls: true,
      files: true,
      gitCorrelation: true,
    });
  });
});
