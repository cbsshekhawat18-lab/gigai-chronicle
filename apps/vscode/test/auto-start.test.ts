/**
 * Auto-start: the decision (pure, no vscode) and the action (against a real
 * temp repo). The decision matrix is the part that must never drift — every
 * "none" here is a case where writing into someone's repo would be wrong.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ChronicleWorkspace } from "../src/engine.js";
import { aiToolInUse, planAutoStart, startChronicle, type AutoStartInput } from "../src/auto-start.js";

const dirs: string[] = [];
const realHome = process.env["HOME"];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  process.env["HOME"] = realHome;
});

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

/** A HOME the test owns, so tool detection is the test's property, not the machine's. */
function useHome(withClaudeCode: boolean): void {
  const home = mkdtempSync(path.join(tmpdir(), "chronicle autostart home "));
  dirs.push(home);
  if (withClaudeCode) mkdirSync(path.join(home, ".claude"));
  process.env["HOME"] = home;
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
    const repo = tempRepo();
    const started = await startChronicle(repo);

    expect(started.capturing).toBe(true);
    expect(started.touched).toContain(".chronicle/config.json");
    expect(started.touched).toContain(".claude/settings.json");

    const settings = JSON.parse(
      readFileSync(path.join(repo, ".claude", "settings.json"), "utf8"),
    ) as { hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>> };
    expect(settings.hooks["UserPromptSubmit"]?.[0]?.hooks?.[0]?.command).toBe(
      "chronicle capture claude-code --event UserPromptSubmit",
    );

    // ...and the extension can now open what it just created.
    expect(await ChronicleWorkspace.open(repo)).not.toBeNull();
  });

  it("no AI tool on this machine: store yes, hooks no, and it says so", async () => {
    useHome(false);
    const repo = tempRepo();
    const started = await startChronicle(repo);
    expect(started.capturing).toBe(false);
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
