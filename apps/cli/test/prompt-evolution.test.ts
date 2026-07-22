/**
 * v0.1.1 — the prompt-evolution surface (launch feedback: "diff the prompts
 * themselves, so I can see what changed between attempts"). Two commands over
 * one real store + real checkpoints:
 *   - `chronicle diff [a] [b]` — the wording delta between two captured prompts
 *   - `chronicle why <file> --evolution` — that delta, along the file's history
 * Real git throughout (checkpoints are git refs); the built bundle is the SUT.
 */
import { execFile, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EventLog, createCheckpoint } from "@gigaichronicle/core";
import { newId, type WorkspaceId } from "@gigaichronicle/schema";

const run = promisify(execFile);
const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist/main.js");

// Literal ULIDs so ordering is the contract, not a timing race (A < B).
const P1 = "evt_01AAAAAAAAAAAAAAAAAAAAAAAA";
const P2 = "evt_01BBBBBBBBBBBBBBBBBBBBBBBB";
const T1 = "add token auth to the login route";
const T2 = "add token auth with refresh-token rotation to the login route";

let repo: string;

async function cli(...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await run(process.execPath, [CLI, ...args], { cwd: repo });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failed = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failed.code ?? 1, stdout: failed.stdout ?? "", stderr: failed.stderr ?? "" };
  }
}

function git(...args: string[]): void {
  execFileSync(
    "git",
    ["-c", "user.name=t", "-c", "user.email=t@t.invalid", "-c", "commit.gpgsign=false", ...args],
    { cwd: repo, encoding: "utf8" },
  );
}

beforeAll(async () => {
  repo = mkdtempSync(path.join(tmpdir(), "chronicle-evo-"));
  git("init", "-q", "-b", "main");
  writeFileSync(path.join(repo, "auth.js"), "line1\n");
  git("add", "-A");
  git("commit", "-q", "-m", "v1");

  const chronicleDir = path.join(repo, ".chronicle");
  mkdirSync(chronicleDir);
  const workspaceId: WorkspaceId = newId("workspace");
  const log = await EventLog.open(chronicleDir, { workspaceId, fsyncIntervalMs: 0 });
  const session = newId("session");
  const prompt = (id: string, text: string, ts: string): unknown => ({
    v: 1,
    id,
    ts,
    type: "PromptSubmitted",
    session,
    actor: { kind: "human" },
    git: { head: "9fc1b2a", branch: "main", dirty: [] },
    payload: { text },
    meta: {
      provider: "claude-code@1.0.0",
      workspace: workspaceId,
      schema: "PromptSubmitted/1",
      visibility: "shared",
    },
  });

  // P1 submitted → checkpoint the tree (line1) → P1's turn adds line2.
  await log.append([prompt(P1, T1, "2026-07-14T10:00:00.000Z")] as never);
  await createCheckpoint(repo, P1);
  writeFileSync(path.join(repo, "auth.js"), "line1\nline2\n");
  // P2 submitted → checkpoint (line1+line2) → P2's turn adds line3 (open turn).
  await log.append([prompt(P2, T2, "2026-07-14T10:05:00.000Z")] as never);
  await createCheckpoint(repo, P2);
  writeFileSync(path.join(repo, "auth.js"), "line1\nline2\nline3\n");
  await log.close();
});

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("chronicle diff — the wording delta between two prompts", () => {
  it("with no args, diffs the last two captured prompts", async () => {
    const { code, stdout } = await cli("--json", "diff");
    expect(code).toBe(0);
    const json = JSON.parse(stdout) as { command: string; a: { eventId: string }; b: { eventId: string }; diff: string };
    expect(json.command).toBe("diff");
    expect(json.a.eventId).toBe(P1);
    expect(json.b.eventId).toBe(P2);
    expect(json.diff).toContain(T1);
    expect(json.diff).toContain("refresh-token rotation");
  });

  it("diffs two prompts named by event id", async () => {
    const { code, stdout } = await cli("--json", "diff", P1, P2);
    expect(code).toBe(0);
    const json = JSON.parse(stdout) as { a: { eventId: string }; b: { eventId: string } };
    expect([json.a.eventId, json.b.eventId]).toEqual([P1, P2]);
  });

  it("exit 2 on exactly one argument (against what?)", async () => {
    const { code, stderr } = await cli("diff", P1);
    expect(code).toBe(2);
    expect(stderr).toContain("usage: chronicle diff");
  });

  it("exit 1 with a clear message for an unknown event id", async () => {
    const { code, stderr } = await cli("diff", P1, "evt_01ZZZZZZZZZZZZZZZZZZZZZZZZ");
    expect(code).toBe(1);
    expect(stderr).toContain("no captured prompt text");
  });
});

describe("chronicle why --evolution — the ask, sharpening", () => {
  it("--json returns mode:evolution with a diff against the previous prompt", async () => {
    const { code, stdout } = await cli("--json", "why", "auth.js", "--evolution");
    expect(code).toBe(0);
    const json = JSON.parse(stdout) as {
      mode: string;
      count: number;
      steps: { eventId: string; prompt: string; diffFromPrev: string | null }[];
    };
    expect(json.mode).toBe("evolution");
    expect(json.steps.map((s) => s.eventId)).toEqual([P1, P2]);
    // The first prompt has nothing before it; the second carries the delta.
    expect(json.steps[0]?.diffFromPrev).toBeNull();
    expect(json.steps[1]?.diffFromPrev).toContain("refresh-token rotation");
  });

  it("text output narrates the change", async () => {
    const { code, stdout } = await cli("why", "auth.js", "--evolution");
    expect(code).toBe(0);
    expect(stdout).toContain("how the ask for auth.js evolved");
    expect(stdout).toContain("how the ask changed from the previous prompt");
  });
});
