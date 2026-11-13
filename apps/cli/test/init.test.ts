/** `chronicle init` e2e against the built bundle — J1's first step. */
import { execFile, execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const run = promisify(execFile);
const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist/main.js");

const dirs: string[] = [];
function tempRepo(withGit = true): string {
  const dir = mkdtempSync(path.join(tmpdir(), "chronicle cli init "));
  dirs.push(dir);
  if (withGit) {
    execFileSync("git", ["-C", dir, "init", "-q", "-b", "main"]);
    execFileSync("git", [
      "-C", dir, "-c", "user.name=t", "-c", "user.email=t@t.invalid",
      "commit", "-q", "--allow-empty", "-m", "root",
    ]);
  }
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/**
 * A HOME the test owns, so provider detection (`~/.claude` exists?) is a
 * property of the test and not of the machine running it.
 */
function tempHome(withClaudeCode: boolean): string {
  const dir = mkdtempSync(path.join(tmpdir(), "chronicle cli home "));
  dirs.push(dir);
  if (withClaudeCode) mkdirSync(path.join(dir, ".claude"));
  return dir;
}

/**
 * PATH control, so "is the `chronicle` CLI installed?" is the test's property
 * and not the machine's: the real PATH minus any dir holding a `chronicle`
 * (git must stay reachable), optionally plus a fake CLI.
 */
function pathWithoutChronicle(): string {
  const raw = Object.entries(process.env).find(([k]) => k.toUpperCase() === "PATH")?.[1] ?? "";
  return raw
    .split(path.delimiter)
    .filter((dir) => !["chronicle", "chronicle.cmd", "chronicle.exe"].some((f) => existsSync(path.join(dir, f))))
    .join(path.delimiter);
}
function fakeCliDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "chronicle cli bin "));
  dirs.push(dir);
  writeFileSync(path.join(dir, "chronicle"), "#!/bin/sh\nexit 0\n");
  chmodSync(path.join(dir, "chronicle"), 0o755);
  if (process.platform === "win32") writeFileSync(path.join(dir, "chronicle.cmd"), "@exit /b 0\r\n");
  return dir;
}
const WITH_CLI = (): string => [fakeCliDir(), pathWithoutChronicle()].join(path.delimiter);
const WITHOUT_CLI = (): string => pathWithoutChronicle();

async function cli(cwd: string, ...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return cliWithHome(cwd, tempHome(true), ...args);
}

async function cliWithHome(
  cwd: string,
  home: string,
  ...args: string[]
): Promise<{ code: number; stdout: string; stderr: string }> {
  return cliWithEnv(cwd, home, WITH_CLI(), ...args);
}

async function cliWithEnv(
  cwd: string,
  home: string,
  searchPath: string,
  ...args: string[]
): Promise<{ code: number; stdout: string; stderr: string }> {
  const env: Record<string, string | undefined> = { ...process.env, HOME: home, USERPROFILE: home };
  for (const key of Object.keys(env)) if (key.toUpperCase() === "PATH") delete env[key];
  env["PATH"] = searchPath;
  try {
    const { stdout, stderr } = await run(process.execPath, [CLI, ...args], { cwd, env });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failed = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failed.code ?? 1, stdout: failed.stdout ?? "", stderr: failed.stderr ?? "" };
  }
}

describe("chronicle init", () => {
  it("--yes initializes with defaults and reports the true footprint", async () => {
    const repo = tempRepo();
    const result = await cli(repo, "--json", "init", "--yes", "--name", "demo-project");
    expect(result.code).toBe(0);
    const json = JSON.parse(result.stdout) as {
      apiVersion: number;
      projectId: string;
      touched: string[];
    };
    expect(json.apiVersion).toBe(1);
    expect(json.projectId).toMatch(/^prj_/);
    expect(json.touched).toContain(".chronicle/config.json");
    expect(json.touched.some((t) => t.includes("amb_wks_"))).toBe(true); // honest footprint
    expect(existsSync(path.join(repo, ".chronicle", "config.json"))).toBe(true);
    expect(existsSync(path.join(repo, ".gitattributes"))).toBe(true);

    // status now shows the project identity and configured providers.
    const status = await cli(repo, "--json", "status");
    const statusJson = JSON.parse(status.stdout) as {
      project: { name: string };
      identity: { foreignRepo: boolean };
    };
    expect(statusJson.project.name).toBe("demo-project");
    expect(statusJson.identity.foreignRepo).toBe(false);
  });

  it("interview flags are honored (--metadata-only, --private-sessions, --git-trailer)", async () => {
    const repo = tempRepo();
    const result = await cli(repo, "init", "--yes", "--metadata-only", "--private-sessions", "--git-trailer");
    expect(result.code).toBe(0);
    const { readFileSync } = await import("node:fs");
    const config = JSON.parse(
      readFileSync(path.join(repo, ".chronicle", "config.json"), "utf8"),
    ) as { capture: { mode?: string; visibility: string; gitTrailer: boolean } };
    expect(config.capture).toMatchObject({
      mode: "metadata",
      visibility: "private",
      gitTrailer: true,
    });
  });

  it("wires live capture: hooks land in .claude/settings.json and are reported", async () => {
    const repo = tempRepo();
    const result = await cli(repo, "--json", "init", "--yes");
    expect(result.code).toBe(0);
    const json = JSON.parse(result.stdout) as {
      touched: string[];
      capture: { live: boolean; hooks: string | null; scope: string | null };
    };
    expect(json.capture).toMatchObject({ live: true, status: "live", hooks: ".claude/settings.json", scope: "project" });
    expect(json.touched).toContain(".claude/settings.json"); // honest footprint

    const settings = JSON.parse(
      readFileSync(path.join(repo, ".claude", "settings.json"), "utf8"),
    ) as { hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>> };
    expect(Object.keys(settings.hooks).sort()).toEqual(
      ["PostToolUse", "SessionEnd", "SessionStart", "Stop", "UserPromptSubmit"],
    );
    // `; exit 0`: a teammate without the CLI gets a quiet no-op, not a hook error (ADR-0018).
    expect(settings.hooks["UserPromptSubmit"]?.[0]?.hooks?.[0]?.command).toBe(
      "chronicle capture claude-code --event UserPromptSubmit; exit 0",
    );

    // ...and status says capture is live rather than only "claude-code:auto".
    const status = await cli(repo, "--json", "status");
    const statusJson = JSON.parse(status.stdout) as {
      capture: { hooks: { expected: boolean; installed: boolean; scope: string | null } };
    };
    expect(statusJson.capture.hooks).toMatchObject({ expected: true, installed: true, scope: "project" });
  });

  it("hooks installed but `chronicle` not on PATH: init, status and doctor all say capture is NOT live", async () => {
    const repo = tempRepo();
    const home = tempHome(true);
    const init = await cliWithEnv(repo, home, WITHOUT_CLI(), "--json", "init", "--yes");
    expect(init.code).toBe(0);
    const initJson = JSON.parse(init.stdout) as { capture: Record<string, unknown> };
    // The hooks went in (they turn live the moment the CLI is installed)...
    expect(initJson.capture).toEqual({ live: false, status: "cli-missing", hooks: ".claude/settings.json", scope: "project" });
    expect(existsSync(path.join(repo, ".claude", "settings.json"))).toBe(true);
    // ...and the human output doesn't pretend otherwise.
    const initText = await cliWithEnv(tempRepo(), home, WITHOUT_CLI(), "init", "--yes");
    expect(initText.stdout).toContain("capture: NOT LIVE");
    expect(initText.stdout).toContain("npm i -g gigai-chronicle");

    // status: flags it (text + JSON), still exit 0 — status reports, doctor judges.
    const status = await cliWithEnv(repo, home, WITHOUT_CLI(), "--json", "status");
    expect(status.code).toBe(0);
    const statusJson = JSON.parse(status.stdout) as { capture: { hooks: Record<string, unknown> } };
    expect(statusJson.capture.hooks).toMatchObject({
      expected: true,
      installed: true,
      status: "cli-missing",
      live: false,
      cliPath: null,
    });
    expect(String(statusJson.capture.hooks["problem"])).toContain("not on PATH");
    const statusText = await cliWithEnv(repo, home, WITHOUT_CLI(), "status");
    expect(statusText.stdout).toMatch(/hooks .*installed.*`chronicle` is not on PATH/);
    expect(statusText.stdout).not.toContain("capture is live");

    // doctor: NOT healthy.
    const doctor = await cliWithEnv(repo, home, WITHOUT_CLI(), "--json", "doctor");
    expect(doctor.code).toBe(1);
    const doctorJson = JSON.parse(doctor.stdout) as { report: { ok: boolean; capture: Record<string, unknown> } };
    expect(doctorJson.report.ok).toBe(false);
    expect(doctorJson.report.capture).toMatchObject({ status: "cli-missing" });
    const doctorText = await cliWithEnv(repo, home, WITHOUT_CLI(), "doctor");
    expect(doctorText.code).toBe(1);
    expect(doctorText.stdout).toContain("capture  ✗ hooks installed but `chronicle` not on PATH");
    expect(doctorText.stdout).toContain("✗ issues found");

    // Install the CLI (put it on PATH) — same hooks, now live and healthy.
    const fixed = await cliWithEnv(repo, home, WITH_CLI(), "--json", "doctor");
    expect(fixed.code).toBe(0);
    expect((JSON.parse(fixed.stdout) as { report: { capture: { status: string } } }).report.capture.status).toBe("live");
    const liveStatus = await cliWithEnv(repo, home, WITH_CLI(), "status");
    expect(liveStatus.stdout).toContain("capture is live");
  });

  it("`hooks install` warns when the hooks it wired have no CLI to run", async () => {
    const repo = tempRepo();
    const home = tempHome(true);
    await cliWithEnv(repo, home, WITHOUT_CLI(), "init", "--yes", "--no-hooks");
    const result = await cliWithEnv(repo, home, WITHOUT_CLI(), "hooks", "install", "claude-code");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("✓ capture hooks installed");
    expect(result.stdout).toContain("`chronicle` is not on PATH");
    const json = await cliWithEnv(repo, home, WITH_CLI(), "--json", "hooks", "install", "claude-code");
    expect(JSON.parse(json.stdout)).toMatchObject({ changed: false, cliOnPath: true });
  });

  it("--no-hooks leaves the repo alone, and status calls the silence out", async () => {
    const repo = tempRepo();
    const result = await cli(repo, "--json", "init", "--yes", "--no-hooks");
    expect(result.code).toBe(0);
    const json = JSON.parse(result.stdout) as { touched: string[]; capture: { live: boolean } };
    expect(json.capture.live).toBe(false);
    expect(json.touched).not.toContain(".claude/settings.json");
    expect(existsSync(path.join(repo, ".claude"))).toBe(false);

    const status = await cli(repo, "--json", "status");
    const statusJson = JSON.parse(status.stdout) as {
      capture: { hooks: { expected: boolean; installed: boolean } };
    };
    expect(statusJson.capture.hooks).toMatchObject({ expected: true, installed: false });
  });

  it("no Claude Code on this machine → no hooks, no .claude/ written", async () => {
    const repo = tempRepo();
    const result = await cliWithHome(repo, tempHome(false), "--json", "init", "--yes");
    expect(result.code).toBe(0);
    const json = JSON.parse(result.stdout) as {
      providers: Record<string, string>;
      capture: { live: boolean };
    };
    expect(json.providers["claude-code"]).toBe("off");
    expect(json.capture.live).toBe(false);
    expect(existsSync(path.join(repo, ".claude"))).toBe(false);
  });

  it("refuses politely outside git (exit 1) and on re-init (exit 1)", async () => {
    const noGit = tempRepo(false);
    const first = await cli(noGit, "init", "--yes");
    expect(first.code).toBe(1);
    expect(first.stderr).toContain("git init");

    const repo = tempRepo();
    await cli(repo, "init", "--yes");
    const again = await cli(repo, "init", "--yes");
    expect(again.code).toBe(1);
    expect(again.stderr).toContain("already");
  });
});
