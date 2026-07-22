/**
 * Codex provider: rollout parsing, meta peek, drift fingerprint, and
 * idempotent, workspace-scoped backfill through the real engine. Fixtures are
 * SYNTHETIC — hand-written to the observed rollout schema, never a real user
 * session (SECURITY.md).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { newId, parseChronicleEventLine, type SessionId } from "@gigaichronicle/schema";
import {
  CAPABILITY,
  PACKAGE_NAME,
  parseRollout,
  readRolloutMeta,
  runBackfill,
} from "../src/index.js";

const SESSION = newId("session") as SessionId;

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
  const root = tempDir("codex-provider ");
  execFileSync("git", ["-C", root, "init", "-q"]);
  const chronicleDir = path.join(root, ".chronicle");
  mkdirSync(chronicleDir);
  return chronicleDir;
}

/** A synthetic rollout for `cwd` — exercises every mapped line type. */
function rolloutFor(cwd: string): string {
  return [
    { timestamp: "2026-07-20T10:00:00.000Z", type: "session_meta", payload: { id: "thread-abc", session_id: "sess-abc", cwd, model: "gpt-5-codex", model_provider: "openai", cli_version: "1.0.0" } },
    { timestamp: "2026-07-20T10:00:05.000Z", type: "event_msg", payload: { type: "user_message", message: "Add a health check endpoint", images: [] } },
    { timestamp: "2026-07-20T10:00:10.000Z", type: "response_item", payload: { type: "custom_tool_call", call_id: "c1", name: "exec", input: "ls -la", status: "completed" } },
    { timestamp: "2026-07-20T10:00:11.000Z", type: "response_item", payload: { type: "custom_tool_call_output", call_id: "c1", output: [{ type: "input_text", text: "ok" }] } },
    { timestamp: "2026-07-20T10:00:20.000Z", type: "event_msg", payload: { type: "agent_message", message: "Added the endpoint.", phase: "final" } },
    { timestamp: "2026-07-20T10:00:21.000Z", type: "event_msg", payload: { type: "token_count", info: {} } },
    { timestamp: "2026-07-20T10:00:22.000Z", type: "world_state", payload: {} },
  ]
    .map((l) => JSON.stringify(l))
    .join("\n");
}

async function storedTypes(chronicleDir: string): Promise<string[]> {
  const events: Array<{ ts: string; type: string }> = [];
  const sessions = path.join(chronicleDir, "sessions");
  let entries: string[] = [];
  try {
    entries = (readdirSync(sessions, { recursive: true }) as string[]).map(String);
  } catch {
    return [];
  }
  for (const entry of entries) {
    if (!entry.endsWith(".jsonl")) continue;
    for (const line of readFileSync(path.join(sessions, entry), "utf8").split("\n")) {
      if (line.trim() === "") continue;
      const verdict = parseChronicleEventLine(line);
      if (verdict.ok) events.push({ ts: verdict.event.ts, type: verdict.event.type });
    }
  }
  return events.sort((a, b) => a.ts.localeCompare(b.ts)).map((e) => e.type);
}

describe("rollout parsing", () => {
  it("maps a session to Chronicle candidates, one source per concept", () => {
    const { candidates } = parseRollout(rolloutFor("/repo").split("\n"), SESSION);
    expect(candidates.map((c) => c.type)).toEqual([
      "SessionStarted",
      "PromptSubmitted",
      "ToolExecuted",
      "AIResponseReceived",
      "SessionEnded",
    ]);
    const byType = (t: string) => candidates.find((c) => c.type === t)?.payload as Record<string, unknown>;
    expect(byType("PromptSubmitted")).toEqual({ text: "Add a health check endpoint" });
    expect(byType("AIResponseReceived")).toEqual({ text: "Added the endpoint.", inResponseTo: null });
    expect(byType("ToolExecuted")).toMatchObject({ tool: "exec", outcome: "success", summary: "ls -la" });
    expect(byType("SessionStarted")).toMatchObject({ title: "Add a health check endpoint" });
    // The model the rollout recorded rides on agent-authored candidates.
    expect(candidates.find((c) => c.type === "AIResponseReceived")?.actor).toMatchObject({ model: "gpt-5-codex" });
  });

  it("readRolloutMeta peeks identity without building candidates", () => {
    const meta = readRolloutMeta(rolloutFor("/my/project").split("\n"));
    expect(meta).toMatchObject({ toolSessionUuid: "thread-abc", cwd: "/my/project", model: "gpt-5-codex" });
  });

  it("a drifted rollout emits nothing and flags drift", () => {
    const lines = [
      '{"type":"session_meta","payload":{"cwd":"/r","id":"x"}}',
      ...Array.from({ length: 8 }, () => '{"type":"totally_unknown_line","payload":{}}'),
    ];
    const parsed = parseRollout(lines, SESSION);
    expect(parsed.drifted).toBe(true);
    expect(parsed.candidates).toEqual([]);
  });
});

describe("backfill (workspace-scoped, idempotent)", () => {
  it("imports only rollouts that ran in THIS repo", async () => {
    const chronicleDir = makeStore();
    const workspacePath = path.dirname(chronicleDir);
    const rolloutsRoot = tempDir("codex-rollouts ");
    // One session in this repo, one from a different project.
    writeFileSync(path.join(rolloutsRoot, "rollout-mine.jsonl"), rolloutFor(workspacePath));
    writeFileSync(path.join(rolloutsRoot, "rollout-other.jsonl"), rolloutFor("/some/other/project"));

    const report = await runBackfill(chronicleDir, {
      knownWorkspacePaths: [workspacePath],
      rolloutsRoot,
    });
    expect(report.filesSeen).toBe(2);
    expect(report.filesForeign).toBe(1); // the other project's session, skipped
    expect(report.filesImported).toBe(1);
    expect(report.eventsImported).toBe(5);
    expect(await storedTypes(chronicleDir)).toEqual([
      "SessionStarted",
      "PromptSubmitted",
      "ToolExecuted",
      "AIResponseReceived",
      "SessionEnded",
    ]);
  });

  it("re-running imports nothing new (idempotent by line cursor)", async () => {
    const chronicleDir = makeStore();
    const workspacePath = path.dirname(chronicleDir);
    const rolloutsRoot = tempDir("codex-rollouts ");
    writeFileSync(path.join(rolloutsRoot, "rollout-mine.jsonl"), rolloutFor(workspacePath));

    await runBackfill(chronicleDir, { knownWorkspacePaths: [workspacePath], rolloutsRoot });
    const again = await runBackfill(chronicleDir, { knownWorkspacePaths: [workspacePath], rolloutsRoot });
    expect(again.eventsImported).toBe(0);
    expect(again.filesImported).toBe(0);
  });
});

describe("identity", () => {
  it("declares an honest tier-2 capability and a matching package name", () => {
    expect(CAPABILITY).toMatchObject({ captureTier: 2, prompts: true, toolCalls: true, files: false });
    expect(PACKAGE_NAME).toBe("@gigaichronicle/provider-codex");
  });
});
