/**
 * Auto-start: the decision (pure, no vscode) and the action (against a real
 * temp repo). The decision matrix is the part that must never drift — every
 * "none" here is a case where writing into someone's repo would be wrong.
 */
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ChronicleWorkspace } from "../src/engine.js";
import { aiToolInUse, planAutoStart, startChronicle, type AutoStartInput } from "../src/auto-start.js";

const dirs: string[] = [];
const realEnv = { HOME: process.env["HOME"], USERPROFILE: process.env["USERPROFILE"], PATH: process.env["PATH"] };
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  process.env["HOME"] = realEnv.HOME;
  process.env["USERPROFILE"] = realEnv.USERPROFILE;
  process.env["PATH"] = realEnv.PATH;
});

/**
 * Is the `chronicle` CLI on PATH? The test's property, not the machine's:
 * `true` puts a fake CLI on PATH, `false` leaves PATH with nothing on it.
 * (Only PATH lookup reads this; init's git calls use absolute-free `git`,
 * so `false` keeps git's own directory.)
 */
function useCli(installed: boolean): void {
  const gitDirs = (realEnv.PATH ?? "")
    .split(path.delimiter)
    .filter((dir) => !["chronicle", "chronicle.cmd", "chronicle.exe"].some((f) => existsSync(path.join(dir, f))));
  if (!installed) {
    process.env["PATH"] = gitDirs.join(path.delimiter);
    return;
  }
  const bin = mkdtempSync(path.join(tmpdir(), "chronicle autostart bin "));
  dirs.push(bin);
  writeFileSync(path.join(bin, "chronicle"), "#!/bin/sh\nexit 0\n");
  chmodSync(path.join(bin, "chronicle"), 0o755);
  if (process.platform === "win32") writeFileSync(path.join(bin, "chronicle.cmd"), "@exit /b 0\r\n");
  process.env["PATH"] = [bin, ...gitDirs].join(path.delimiter);
}

function tempRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "chronicle autostart "));
  dirs.push(dir);
  execFileSync("git", ["-C", dir, "init", "-q", "-b", "main"]);
  execFileSync("git", [
    "-C", dir, "-c", "user.name=t", "-c", "user.email=t@t.invalid",
    "commit", "-q", "--allow-empty", "-m", "root",
  ]);
  return dir;
}

/**
 * A home directory the test owns, so tool detection is the test's property and
 * not the machine's. Both variables: `os.homedir()` reads HOME on POSIX and
 * USERPROFILE on Windows, and setting only one passes locally then fails on
 * the Windows leg of the matrix.
 */
function useHome(withClaudeCode: boolean): void {
  const home = mkdtempSync(path.join(tmpdir(), "chronicle autostart home "));
  dirs.push(home);
  if (withClaudeCode) mkdirSync(path.join(home, ".claude"));
  process.env["HOME"] = home;
  process.env["USERPROFILE"] = home;
}

const ready: AutoStartInput = {
  mode: "auto",
  initialized: false,
  isGitRepository: true,
  trusted: true,
  declined: false,
  aiToolInUse: true,
};

describe("planAutoStart", () => {
  it("starts on its own in a repo you work on with an AI tool", () => {
    expect(planAutoStart(ready)).toEqual({ action: "start" });
  });

  it("asks in a repo you merely opened — never writes into it unasked", () => {
    expect(planAutoStart({ ...ready, aiToolInUse: false })).toEqual({ action: "ask" });
  });

  it("asks instead when the mode says ask, even where a tool is in use", () => {
    expect(planAutoStart({ ...ready, mode: "ask" })).toEqual({ action: "ask" });
  });

  it.each([
    ["an existing project is left alone", { initialized: true }],
    ["off means off", { mode: "off" as const }],
    ["an untrusted workspace is never written to", { trusted: false }],
    ["a folder that isn't a repo isn't a project", { isGitRepository: false }],
    ["a workspace that said no is not asked twice", { declined: true }],
  ])("does nothing: %s", (_label, override) => {
    expect(planAutoStart({ ...ready, ...override }).action).toBe("none");
  });

  it("off and untrusted outrank ask — neither writes nor nags", () => {
    expect(planAutoStart({ ...ready, mode: "ask", trusted: false }).action).toBe("none");
    expect(planAutoStart({ ...ready, mode: "ask", initialized: true }).action).toBe("none");
  });
});

describe("aiToolInUse", () => {
  it("is true for a repo with .claude/, false for a bare one", async () => {
    const bare = tempRepo();
    expect(await aiToolInUse(bare)).toBe(false);
    mkdirSync(path.join(bare, ".claude"));
    expect(await aiToolInUse(bare)).toBe(true);
  });
});

describe("startChronicle", () => {
  it("scaffolds the store AND wires capture, and reports both", async () => {
    useHome(true);
    useCli(true);
    const repo = tempRepo();
    const started = await startChronicle(repo);

    expect(started.capturing).toBe(true);
    expect(started.captureStatus).toBe("live");
    expect(started.touched).toContain(".chronicle/config.json");
    expect(started.touched).toContain(".claude/settings.json");

    const settings = JSON.parse(
      readFileSync(path.join(repo, ".claude", "settings.json"), "utf8"),
    ) as { hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>> };
    expect(settings.hooks["UserPromptSubmit"]?.[0]?.hooks?.[0]?.command).toBe(
      "chronicle capture claude-code --event UserPromptSubmit; exit 0",
    );

    // ...and the extension can now open what it just created.
    expect(await ChronicleWorkspace.open(repo)).not.toBeNull();
  });

  it("hooks wired but no `chronicle` on PATH: NOT capturing — cli-missing, not live", async () => {
    useHome(true);
    useCli(false);
    const repo = tempRepo();
    const started = await startChronicle(repo);
    expect(started.captureStatus).toBe("cli-missing");
    expect(started.capturing).toBe(false);
    expect(started.touched).toContain(".claude/settings.json"); // the hooks still went in
  });

  it("no AI tool on this machine: store yes, hooks no, and it says so", async () => {
    useHome(false);
    const repo = tempRepo();
    const started = await startChronicle(repo);
    expect(started.capturing).toBe(false);
    expect(started.captureStatus).toBe("off");
    expect(existsSync(path.join(repo, ".claude"))).toBe(false);
    expect(existsSync(path.join(repo, ".chronicle", "config.json"))).toBe(true);
  });

  it("outside git it fails with a reason worth showing", async () => {
    useHome(true);
    const notRepo = mkdtempSync(path.join(tmpdir(), "chronicle autostart bare "));
    dirs.push(notRepo);
    await expect(startChronicle(notRepo)).rejects.toThrow(/git init/);
  });
});
