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
