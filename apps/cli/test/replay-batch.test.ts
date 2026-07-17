/** M8 CLI batch e2e: replay · log · inspect · session promote/privatize. */
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const run = promisify(execFile);
const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist/main.js");

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

beforeAll(async () => {
  repo = mkdtempSync(path.join(tmpdir(), "chronicle m8 "));
  execFileSync("git", ["-C", repo, "init", "-q", "-b", "main"]);
  execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@t.invalid", "commit", "-q", "--allow-empty", "-m", "root"]);
  await cli("init", "--yes");
  await cli("log", "first manual note about token rotation");
  await cli("log", "second note");
});

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
});

async function manualSession(): Promise<string> {
  const { stdout } = await cli("--json", "timeline", "--type", "SessionStarted");
  return (JSON.parse(stdout) as { events: Array<{ session: string }> }).events[0]?.session as string;
}

describe("chronicle log → replay → inspect", () => {
  it("manual notes land in one session per day and replay lossy (honest)", async () => {
    const session = await manualSession();
    expect(session).toMatch(/^ses_/);

    const replay = await cli("replay", session);
    expect(replay.code).toBe(0);
    expect(replay.stdout).toContain("you      first manual note about token rotation");
    expect(replay.stdout).toContain("fidelity lossy"); // manual provider — no false confidence

    const json = await cli("--json", "replay", session);
    const parsed = JSON.parse(json.stdout) as { frames: number; frame: { fidelity: string } };
    expect(parsed.frames).toBe(3); // SessionStarted + 2 notes
    expect(parsed.frame.fidelity).toBe("lossy");
  });

  it("inspect works for sessions and events; garbage is a clean failure", async () => {
    const session = await manualSession();
    const inspect = await cli("inspect", session);
    expect(inspect.code).toBe(0);
    expect(inspect.stdout).toContain("chronicle replay");

    const { stdout } = await cli("--json", "timeline", "--limit", "1");
    const eventId = (JSON.parse(stdout) as { events: Array<{ id: string }> }).events[0]?.id as string;
    const event = await cli("--json", "inspect", eventId);
    expect((JSON.parse(event.stdout) as { kind: string }).kind).toBe("event");

    expect((await cli("inspect", "not-a-thing")).code).toBe(1);
  });

  it("session privatize moves the stream off the shared record; promote restores it", async () => {
    const session = await manualSession();
    const priv = await cli("session", "privatize", session);
    expect(priv.code).toBe(0);
    const month = new Date().toISOString().slice(0, 7).replace("-", "/");
    expect(existsSync(path.join(repo, ".chronicle", ".local", "private", "sessions", month, `${session}.jsonl`))).toBe(true);
    expect(existsSync(path.join(repo, ".chronicle", "sessions", month, `${session}.jsonl`))).toBe(false);
    // Off the record: replay no longer sees it.
    expect((await cli("replay", session)).code).toBe(1);

    const promoted = await cli("session", "promote", session);
    expect(promoted.code).toBe(0);
    expect((await cli("replay", session)).code).toBe(0);
  });
});

describe("chronicle prompt (version control for prompts)", () => {
  it("save → list → new version → diff → show frozen version", async () => {
    const save1 = await cli("prompt", "save", "auth-review", "--text", "Check token rotation.", "--title", "Auth review", "--tags", "security,review");
    expect(save1.code).toBe(0);
    expect(save1.stdout).toContain("auth-review v1");

    const save2 = await cli("prompt", "save", "auth-review", "--text", "Check token rotation.\nAlso revoke family on reuse.");
    expect(save2.stdout).toContain("v2");

    const list = await cli("--json", "prompt", "list");
    const parsed = JSON.parse(list.stdout) as { prompts: Array<{ slug: string; version: number }> };
    expect(parsed.prompts).toEqual([expect.objectContaining({ slug: "auth-review", version: 2 })]);

    const diff = await cli("prompt", "diff", "auth-review", "1", "2");
    expect(diff.stdout).toContain("+ Also revoke family on reuse.");

    const v1 = await cli("--json", "prompt", "show", "auth-review", "1");
    expect((JSON.parse(v1.stdout) as { prompt: { body: string } }).prompt.body).toBe("Check token rotation.");

    expect((await cli("prompt", "diff", "auth-review")).code).toBe(2); // usage
  });
});

describe("chronicle restore (⏪ code time-travel, ADR-0012)", () => {
  it("prompt capture checkpoints the tree; restore --force brings the code back", async () => {
    const { writeFileSync, readFileSync } = await import("node:fs");
    const { execFileSync } = await import("node:child_process");
    const nodePath = await import("node:path");

    // v1 state: two inputs.
    writeFileSync(nodePath.join(repo, "form.js"), "input1\ninput2\n");
    execFileSync("git", ["-C", repo, "add", "-A"]);
    execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@t.invalid", "commit", "-q", "-m", "form v1"]);

    // A captured prompt (hook path, stdin) checkpoints the current tree.
    const stdin = JSON.stringify({ session_id: "ckpt-uuid", prompt: "add more inputs" });
    execFileSync(process.execPath, [CLI, "capture", "claude-code", "--event", "UserPromptSubmit"], { cwd: repo, input: stdin });

    const timeline = await cli("--json", "timeline", "--type", "PromptSubmitted", "--limit", "200");
    const events = (JSON.parse(timeline.stdout) as { events: Array<{ id: string; payload: { text: string } }> }).events;
    const evt = events.find((e) => e.payload.text === "add more inputs");
    expect(evt).toBeDefined();

    // v2 "improvement" that is worse.
    writeFileSync(nodePath.join(repo, "form.js"), "input1\ninput2\ninput3\ninput4\ninput5\n");

    const restore = await cli("restore", (evt as { id: string }).id, "--force");
    expect(restore.code).toBe(0);
    expect(restore.stdout).toContain("restored 1 file(s)");
    // Normalize CRLF: Windows git checks out with \r\n; the restore is correct either way.
    expect(readFileSync(nodePath.join(repo, "form.js"), "utf8").replace(/\r\n/g, "\n")).toBe("input1\ninput2\n");

    // The restore itself is on the record.
    const after = await cli("--json", "timeline", "--type", "Ext.chronicle.WorkspaceRestored", "--limit", "10");
    expect((JSON.parse(after.stdout) as { count: number }).count).toBeGreaterThanOrEqual(1);
  });
});
