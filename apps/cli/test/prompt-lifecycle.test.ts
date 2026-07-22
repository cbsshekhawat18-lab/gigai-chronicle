/**
 * The prompt lifecycle at the CLI surface (v0.1.1): use (get a saved prompt
 * into your hands), compare (cross-prompt diff), revert (append-only
 * rollback), --note, and the derived used/saved status in list. The built
 * bundle is the SUT; a real store backs every assertion.
 */
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EventLog } from "@gigaichronicle/core";
import { newId, type WorkspaceId } from "@gigaichronicle/schema";

const run = promisify(execFile);
const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist/main.js");

let repo: string;
const workspaceId: WorkspaceId = newId("workspace");

async function cli(...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await run(process.execPath, [CLI, ...args], { cwd: repo });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failed = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failed.code ?? 1, stdout: failed.stdout ?? "", stderr: failed.stderr ?? "" };
  }
}

const RESEARCH = "Audit this code for security issues. Focus on injection and authz.";

beforeAll(async () => {
  repo = mkdtempSync(path.join(tmpdir(), "chronicle-lifecycle-"));
  mkdirSync(path.join(repo, ".chronicle"));

  // A research prompt saved for later (v1, with a note), then narrowed (v2).
  await cli("prompt", "save", "security-audit", "--text", RESEARCH, "--title", "Security audit", "--note", "first research draft");
  await cli("prompt", "save", "security-audit", "--text", "Audit ONLY for injection.", "--note", "narrowed scope");
  // A second prompt to compare against.
  await cli("prompt", "save", "perf-audit", "--text", "Audit this code for performance.");

  // Capture observes the v1 text actually submitted — that makes it USED.
  const log = await EventLog.open(path.join(repo, ".chronicle"), { workspaceId, fsyncIntervalMs: 0 });
  await log.append([
    {
      v: 1,
      id: newId("event"),
      ts: "2026-07-20T10:00:00.000Z",
      type: "PromptSubmitted",
      session: newId("session"),
      actor: { kind: "human" },
      git: { head: "9fc1b2a", branch: "main", dirty: [] },
      payload: { text: RESEARCH },
      meta: { provider: "claude-code@1.0.0", workspace: workspaceId, schema: "PromptSubmitted/1", visibility: "shared" },
    },
  ] as never);
  await log.close();
});

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("prompt use — a saved prompt into your hands", () => {
  it("prints the body on stdout, pipeable and nothing else", async () => {
    const { code, stdout } = await cli("prompt", "use", "security-audit@1");
    expect(code).toBe(0);
    expect(stdout.trim()).toBe(RESEARCH);
  });

  it("slug alone means the current version", async () => {
    const { code, stdout } = await cli("prompt", "use", "security-audit");
    expect(code).toBe(0);
    expect(stdout.trim()).toBe("Audit ONLY for injection.");
  });

  it("a bad version ref is a usage error, exit 2", async () => {
    expect((await cli("prompt", "use", "security-audit@0")).code).toBe(2);
  });
});

describe("prompt compare — across prompts, any versions", () => {
  it("diffs two different prompts at chosen versions", async () => {
    const { code, stdout } = await cli("--json", "prompt", "compare", "security-audit@1", "perf-audit");
    expect(code).toBe(0);
    const json = JSON.parse(stdout) as { a: { slug: string; version: number }; b: { slug: string }; diff: string };
    expect(json.a).toEqual({ slug: "security-audit", version: 1 });
    expect(json.b.slug).toBe("perf-audit");
    expect(json.diff).toContain("performance");
  });
});

describe("prompt revert — rollback without rewriting", () => {
  it("an old body becomes the new current version; history keeps the detour", async () => {
    const { code, stdout } = await cli("--json", "prompt", "revert", "security-audit", "1");
    expect(code).toBe(0);
    const json = JSON.parse(stdout) as { prompt: { version: number; body: string; note: string } };
    expect(json.prompt.version).toBe(3);
    expect(json.prompt.body).toBe(RESEARCH);
    expect(json.prompt.note).toBe("revert to v1");
    // v2 (the detour) is still readable.
    expect((await cli("prompt", "use", "security-audit@2")).stdout).toContain("ONLY for injection");
  });

  it("reverting to content already current fails cleanly, exit 1", async () => {
    const { code, stderr } = await cli("prompt", "revert", "security-audit", "1");
    expect(code).toBe(1);
    expect(stderr).toContain("nothing to revert");
  });
});

describe("derived lifecycle status in list and versions", () => {
  it("list marks observed prompts ● used and untouched research ○ saved", async () => {
    const { code, stdout } = await cli("prompt", "list");
    expect(code).toBe(0);
    expect(stdout).toMatch(/security-audit\s+v3\s+● used ×1/);
    expect(stdout).toMatch(/perf-audit\s+v1\s+○ saved for later/);
  });

  it("--json carries status/uses/lastUsedTs per prompt", async () => {
    const { stdout } = await cli("--json", "prompt", "list");
    const json = JSON.parse(stdout) as { prompts: Array<{ slug: string; status: string; uses: number }> };
    const bySlug = new Map(json.prompts.map((p) => [p.slug, p]));
    expect(bySlug.get("security-audit")).toMatchObject({ status: "used", uses: 1 });
    expect(bySlug.get("perf-audit")).toMatchObject({ status: "saved", uses: 0 });
  });

  it("versions shows notes and per-version usage; JSON keeps versions as numbers", async () => {
    const text = await cli("prompt", "versions", "security-audit");
    expect(text.stdout).toContain('"first research draft"');
    expect(text.stdout).toContain('"narrowed scope"');
    // The observed use matches v1's body, whose newest twin is v3 (the revert).
    expect(text.stdout).toMatch(/v3\s+used ×1/);

    const { stdout } = await cli("--json", "prompt", "versions", "security-audit");
    const json = JSON.parse(stdout) as { versions: number[]; details: Array<{ version: number; uses: number; note: string | null }> };
    expect(json.versions).toEqual([1, 2, 3]); // the stable contract, unchanged
    expect(json.details.find((d) => d.version === 3)?.uses).toBe(1);
  });
});
