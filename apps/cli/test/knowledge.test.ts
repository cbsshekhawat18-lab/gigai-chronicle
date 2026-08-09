/**
 * `chronicle knowledge` + `chronicle context` e2e against the built bundle —
 * decisions/TODOs surfaced from a real store, and the Context Pack assembled
 * from a file's checkpoint-derived shaping prompt. Real git + real store.
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
const P1 = "evt_01AAAAAAAAAAAAAAAAAAAAAAAA";

let repo: string;
const workspaceId: WorkspaceId = newId("workspace");

async function cli(...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await run(process.execPath, [CLI, ...args], { cwd: repo });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const f = error as { code?: number; stdout?: string; stderr?: string };
    return { code: f.code ?? 1, stdout: f.stdout ?? "", stderr: f.stderr ?? "" };
  }
}

function git(...args: string[]): void {
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t.invalid", "-c", "commit.gpgsign=false", ...args], {
    cwd: repo,
    encoding: "utf8",
  });
}

beforeAll(async () => {
  repo = mkdtempSync(path.join(tmpdir(), "chronicle-knowledge-"));
  git("init", "-q", "-b", "main");
  writeFileSync(path.join(repo, "auth.js"), "line1\n");
  git("add", "-A");
  git("commit", "-q", "-m", "v1");

  const chronicleDir = path.join(repo, ".chronicle");
  mkdirSync(chronicleDir);
  const log = await EventLog.open(chronicleDir, { workspaceId, fsyncIntervalMs: 0 });
  const session = newId("session");
  await log.append([
    {
      v: 1,
      id: P1,
      ts: "2026-07-14T10:00:00.000Z",
      type: "PromptSubmitted",
      session,
      actor: { kind: "human" },
      git: { head: "9fc1b2a", branch: "main", dirty: [] },
      payload: { text: "let's use JWT — add token auth to auth.js\nTODO: revisit later for refresh rotation" },
      meta: { provider: "example@1.0.0", workspace: workspaceId, schema: "PromptSubmitted/1", visibility: "shared" },
    },
  ] as never);
  await log.close();
  await createCheckpoint(repo, P1); // tree = line1
  writeFileSync(path.join(repo, "auth.js"), "line1\nline2\n"); // P1's open turn changed auth.js
});

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("chronicle knowledge", () => {
  it("surfaces the decision and the TODO with provenance", async () => {
    const { code, stdout } = await cli("knowledge");
    expect(code).toBe(0);
    expect(stdout).toContain("let's use JWT");
    expect(stdout).toContain("revisit later");
    expect(stdout).toMatch(/decisions \(\d+\)/);
    expect(stdout).toMatch(/todos \(\d+\)/);
  });

  it("--json carries kind/role/confidence/eventId, and --type filters", async () => {
    const { stdout } = await cli("--json", "knowledge", "--type", "decision");
    const json = JSON.parse(stdout) as { items: Array<{ kind: string; role: string; confidence: string; eventId: string }> };
    expect(json.items.length).toBeGreaterThan(0);
    expect(json.items.every((i) => i.kind === "decision")).toBe(true);
    expect(json.items[0]).toMatchObject({ role: "human", eventId: P1 });
  });
});

describe("chronicle context <file>", () => {
  it("assembles a paste-ready brief with the shaping prompt and the decision", async () => {
    const { code, stdout } = await cli("context", "auth.js");
    expect(code).toBe(0);
    expect(stdout).toContain("# Context for auth.js");
    expect(stdout).toContain("let's use JWT");
    // The pack now surfaces state-aware Project Memory (the "why"), not just raw knowledge.
    expect(stdout).toContain("Why this file looks the way it does");
    expect(stdout).toContain("Active decisions");
    expect(stdout).toContain("never calls a model");
  });

  it("--json exposes prompts, knowledge, and the markdown", async () => {
    const { stdout } = await cli("--json", "context", "auth.js");
    const json = JSON.parse(stdout) as { empty: boolean; prompts: unknown[]; knowledge: unknown[]; markdown: string };
    expect(json.empty).toBe(false);
    expect(json.prompts.length).toBe(1);
    expect(json.knowledge.length).toBeGreaterThan(0);
    expect(json.markdown).toContain("# Context for auth.js");
  });

  it("exit 2 for a path outside the repo", async () => {
    expect((await cli("context", "/etc/hosts")).code).toBe(2);
  });
});
