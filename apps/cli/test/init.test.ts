/** `chronicle init` e2e against the built bundle — J1's first step. */
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
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

async function cli(cwd: string, ...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await run(process.execPath, [CLI, ...args], { cwd });
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
