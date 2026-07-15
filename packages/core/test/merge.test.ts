/**
 * The R7 fixture: two clones record sessions independently and git-merge
 * without a single conflict — "git IS the sync engine" (§17.1), proven with
 * real git, not simulated file unions.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { newId, type WorkspaceId } from "@gigaichronicle/schema";
import { EventLog } from "../src/index.js";
import { makeTempChronicleDir, promptEvent, commitEvent } from "./helpers/events.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    "git",
    [
      "-c",
      "user.name=chronicle-test",
      "-c",
      "user.email=test@example.invalid",
      "-c",
      "commit.gpgsign=false",
      ...args,
    ],
    { cwd, encoding: "utf8" },
  );
}

async function recordSession(repo: string, workspace: WorkspaceId): Promise<void> {
  const chronicleDir = path.join(repo, ".chronicle");
  const log = await EventLog.open(chronicleDir, { workspaceId: workspace, fsyncIntervalMs: 0 });
  const session = newId("session");
  await log.append([
    promptEvent(session, `work in ${workspace}`, {
      meta: {
        provider: "example-tool@1.0.0",
        workspace,
        schema: "PromptSubmitted/1",
        visibility: "shared",
      },
    }),
    commitEvent(workspace), // ambient stream — per-workspace file (ADR-0007)
  ]);
  await log.close();
  rmSync(path.join(chronicleDir, ".local"), { recursive: true, force: true }); // never committed
}

describe("two-branch merge (risk R7)", () => {
  it("sessions recorded on two branches merge with zero conflicts and verify clean", async () => {
    const repo = makeTempChronicleDir("chronicle-merge-");
    dirs.push(repo);
    git(repo, "init", "-q", "-b", "main");
    mkdirSync(path.join(repo, ".chronicle"), { recursive: true });
    writeFileSync(path.join(repo, ".chronicle", ".gitignore"), ".cache/\n.local/\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "base");

    // Branch A — "machine A" records a session.
    git(repo, "checkout", "-q", "-b", "machine-a");
    await recordSession(repo, newId("workspace"));
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "journey on machine A");

    // Branch B from base — "machine B" records independently.
    git(repo, "checkout", "-q", "main");
    git(repo, "checkout", "-q", "-b", "machine-b");
    await recordSession(repo, newId("workspace"));
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "journey on machine B");

    // The moment of truth.
    const mergeOutput = git(repo, "merge", "--no-edit", "machine-a");
    expect(mergeOutput).not.toMatch(/CONFLICT/);

    // Post-merge: the union store verifies clean and scans both journeys.
    const log = await EventLog.open(path.join(repo, ".chronicle"), {
      workspaceId: newId("workspace"),
      fsyncIntervalMs: 0,
    });
    const report = await log.verify();
    expect(report.healed).toEqual([]);
    expect(report.problems).toEqual([]);

    const types: string[] = [];
    for await (const { event } of log.scan()) types.push(event.type);
    expect(types.filter((t) => t === "PromptSubmitted")).toHaveLength(2);
    expect(types.filter((t) => t === "GitCommitCreated")).toHaveLength(2);
    await log.close();
  });
});
