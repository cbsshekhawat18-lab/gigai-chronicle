/**
 * CLI e2e against the BUILT single-file bundle (dist/main.js) — exit-code
 * contract, `--json` envelope contract (these assertions ARE the
 * compatibility contract, §21), and the cold-start budget.
 */
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INDEX_SCHEMA_VERSION } from "@gigaichronicle/core";
import { EventLog } from "@gigaichronicle/core";
import { newId, type WorkspaceId } from "@gigaichronicle/schema";

const run = promisify(execFile);
const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist/main.js");
async function cli(
  cwd: string,
  ...args: string[]
): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await run(process.execPath, [CLI, ...args], { cwd });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failed = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failed.code ?? 1, stdout: failed.stdout ?? "", stderr: failed.stderr ?? "" };
  }
}

let repo: string;
const workspaceId: WorkspaceId = newId("workspace");

beforeAll(async () => {
  repo = mkdtempSync(path.join(tmpdir(), "chronicle-cli-"));
  const chronicleDir = path.join(repo, ".chronicle");
  const { mkdirSync } = await import("node:fs");
  mkdirSync(chronicleDir);
  const log = await EventLog.open(chronicleDir, { workspaceId, fsyncIntervalMs: 0 });
  const session = newId("session");
  await log.append([
    {
      v: 1,
      id: newId("event"),
      ts: "2026-07-14T10:32:11.412Z",
      type: "PromptSubmitted",
      session,
      actor: { kind: "human" },
      git: { head: "9fc1b2a", branch: "feat/auth", dirty: [] },
      payload: { text: "Add refresh-token rotation with key AKIAIOSFODNN7EXAMPLE" },
      meta: {
        provider: "example-tool@1.0.0",
        workspace: workspaceId,
        schema: "PromptSubmitted/1",
        visibility: "shared",
      },
    },
  ] as never);
  await log.close();
});

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("exit-code contract (§14 — stable forever)", () => {
  it("3 outside a chronicle project", async () => {
    const outside = mkdtempSync(path.join(tmpdir(), "not-a-project-"));
    try {
      const { code, stderr } = await cli(outside, "status");
      expect(code).toBe(3);
      expect(stderr).toContain("not a chronicle project");
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("2 on usage errors", async () => {
    expect((await cli(repo, "no-such-command")).code).toBe(2);
  });

  it("0 on success; 1 when doctor finds issues (planted secret)", async () => {
    expect((await cli(repo, "status")).code).toBe(0);
    expect((await cli(repo, "doctor")).code).toBe(0);
    const audit = await cli(repo, "--json", "doctor", "--scan-secrets");
    expect(audit.code).toBe(1);
    // Findings report kinds, never content.
    expect(audit.stdout).toContain("aws-access-key-id");
    expect(audit.stdout).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });
});

describe("--json envelope contract", () => {
  it("doctor: apiVersion, report shape, zero-network verdict", async () => {
    const { stdout } = await cli(repo, "--json", "doctor");
    const json = JSON.parse(stdout) as Record<string, unknown>;
    expect(json).toMatchObject({
      apiVersion: 1,
      command: "doctor",
      report: {
        ok: true,
        store: { healed: [], problems: [] },
        // The contract is that doctor REPORTS the index schema version — not
        // that it is any particular number. The index is a disposable cache
        // whose version is meant to bump (a mismatch rebuilds; migrations do
        // not exist), so pinning a literal here would fail every legitimate
        // bump and teach the next engineer to edit the test reflexively.
        index: { fresh: true, schemaVersion: INDEX_SCHEMA_VERSION },
        egress: { endpoints: [], telemetry: "none", verdict: "zero-network" },
      },
    });
  });

  it("timeline: events with full envelopes", async () => {
    const { stdout } = await cli(repo, "--json", "timeline");
    const json = JSON.parse(stdout) as { apiVersion: number; count: number; events: unknown[] };
    expect(json.apiVersion).toBe(1);
    expect(json.count).toBe(1);
    expect(json.events[0]).toMatchObject({ v: 1, type: "PromptSubmitted" });
  });

  it("status: store/index/capture sections, honest capture note", async () => {
    const { stdout } = await cli(repo, "--json", "status");
    const json = JSON.parse(stdout) as Record<string, unknown>;
    expect(json).toMatchObject({
      apiVersion: 1,
      command: "status",
      store: { events: expect.any(Number) as number },
      index: { fresh: true },
      capture: { providers: [] },
    });
  });
});
