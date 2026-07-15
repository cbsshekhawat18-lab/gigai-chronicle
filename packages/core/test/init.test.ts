import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { configSchema } from "@gigaichronicle/schema";
import { isChronicleError, openWorkspace, runInit, utcDay } from "../src/index.js";

const roots: string[] = [];
function tempRepo(withGit = true): string {
  const dir = mkdtempSync(path.join(tmpdir(), "chronicle init "));
  roots.push(dir);
  if (withGit) {
    git(dir, "init", "-q", "-b", "main");
    git(dir, "commit", "-q", "--allow-empty", "-m", "root");
  }
  return dir;
}
afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    "git",
    ["-c", "user.name=t", "-c", "user.email=t@t.invalid", "-c", "commit.gpgsign=false", ...args],
    { cwd, encoding: "utf8" },
  );
}

describe("runInit", () => {
  it("DoD #2: the complete git-visible footprint is config, .gitignore, .gitattributes, and the first journey event", async () => {
    const repo = tempRepo();
    const result = await runInit(repo, { detectedProviders: { "example-tool": "auto" } });

    const status = git(repo, "status", "--porcelain", "-uall")
      .trim()
      .split("\n")
      .map((line) => line.slice(3))
      .sort();
    expect(status).toEqual(
      [
        ".chronicle/.gitignore",
        ".chronicle/config.json",
        `.chronicle/sessions/${utcDay().slice(0, 7).replace("-", "/")}/amb_${machineWorkspace(repo)}.jsonl`,
        ".gitattributes",
      ].sort(),
    );
    expect(result.touched.sort()).toEqual(status.sort()); // init reports its true footprint
  });

  it("DoD #3: config.json is schema-valid with no dead keys", async () => {
    const repo = tempRepo();
    await runInit(repo, {
      projectName: "acme-api",
      captureMode: "metadata",
      sessionVisibility: "private",
      gitTrailer: true,
      detectedProviders: { "example-tool": "auto", "cursor-db": "off" },
    });
    const raw = JSON.parse(readFileSync(path.join(repo, ".chronicle", "config.json"), "utf8"));
    expect(configSchema.safeParse(raw).success).toBe(true);
    expect(Object.keys(raw).sort()).toEqual(["$schema", "capture", "project", "storage", "version"]);
    expect(raw.capture).toMatchObject({
      mode: "metadata",
      visibility: "private",
      gitTrailer: true,
    });
    expect(raw.sync).toBeUndefined(); // reserved keys stay OFF disk (ADR-0005)
    expect(raw.plugins).toBeUndefined();
  });

  it("appends to an existing .gitattributes without clobbering, idempotently", async () => {
    const repo = tempRepo();
    writeFileSync(path.join(repo, ".gitattributes"), "*.png binary\n");
    await runInit(repo, { detectedProviders: {} });
    const content = readFileSync(path.join(repo, ".gitattributes"), "utf8");
    expect(content).toBe("*.png binary\n.chronicle/sessions/** linguist-generated=true\n");
  });

  it("refuses without git, refuses double-init — with typed errors", async () => {
    const noGit = tempRepo(false);
    await expect(runInit(noGit)).rejects.toSatisfy((e) =>
      isChronicleError(e, "E_NOT_INITIALIZED"),
    );

    const repo = tempRepo();
    await runInit(repo, { detectedProviders: {} });
    await expect(runInit(repo)).rejects.toSatisfy((e) =>
      isChronicleError(e, "E_ALREADY_INITIALIZED"),
    );
  });

  it("ProjectOpened throttle: init day counts; next-day open records exactly one", async () => {
    const repo = tempRepo();
    await runInit(repo, { detectedProviders: {} });
    const chronicleDir = path.join(repo, ".chronicle");

    // Same day: opening does not add a ProjectOpened.
    await openWorkspace(chronicleDir);
    await openWorkspace(chronicleDir);
    expect(countOpens(repo)).toBe(0);

    // Force "yesterday" in the throttle marker → exactly one on next open.
    const machineFile = path.join(chronicleDir, ".local", "machine.json");
    const state = JSON.parse(readFileSync(machineFile, "utf8"));
    state.lastProjectOpenedDay = "2020-01-01";
    writeFileSync(machineFile, JSON.stringify(state));
    await openWorkspace(chronicleDir);
    await openWorkspace(chronicleDir);
    expect(countOpens(repo)).toBe(1);
  });
});

function machineWorkspace(repo: string): string {
  return (
    JSON.parse(
      readFileSync(path.join(repo, ".chronicle", ".local", "machine.json"), "utf8"),
    ) as { workspace: string }
  ).workspace;
}

function countOpens(repo: string): number {
  const opsRoot = path.join(repo, ".chronicle", ".local", "ops");
  let count = 0;
  try {
    for (const entry of readdirSync(opsRoot, { recursive: true }) as string[]) {
      if (!entry.toString().endsWith(".jsonl")) continue;
      const lines = readFileSync(path.join(opsRoot, entry.toString()), "utf8").trim().split("\n");
      count += lines.filter((line) => line.includes('"ProjectOpened"')).length;
    }
  } catch {
    return 0;
  }
  return count;
}
