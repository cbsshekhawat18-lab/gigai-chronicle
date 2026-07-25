/**
 * Context Pack: assemble a paste-ready brief for a file from its checkpoint-
 * derived shaping prompts (ADR-0013) plus the decisions from those sessions.
 * Real git checkpoints throughout — the attribution is derived from refs.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type SessionId } from "@gigaichronicle/schema";
import { EventLog, buildContextPack, createCheckpoint } from "../src/index.js";
import { WORKSPACE } from "./helpers/events.js";

const P1 = "evt_01AAAAAAAAAAAAAAAAAAAAAAAA";
const SES = "ses_01ARZ3NDEKTSV4RRFFQ69G5FA0" as SessionId;

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t.invalid", "-c", "commit.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
  });
}

async function repoWithChronicle(): Promise<{ repo: string; chronicleDir: string }> {
  const repo = mkdtempSync(path.join(tmpdir(), "chronicle-ctx-"));
  dirs.push(repo);
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(path.join(repo, "app.js"), "line1\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "v1");
  const chronicleDir = path.join(repo, ".chronicle");
  mkdirSync(chronicleDir);
  return { repo, chronicleDir };
}

async function withLog<T>(chronicleDir: string, fn: (log: EventLog) => Promise<T>): Promise<T> {
  const log = await EventLog.open(chronicleDir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
  try {
    return await fn(log);
  } finally {
    await log.close();
  }
}

describe("context pack", () => {
  it("briefs a file with its shaping prompt and the decision from that session", async () => {
    const { repo, chronicleDir } = await repoWithChronicle();
    await withLog(chronicleDir, (log) =>
      log.append([
        {
          v: 1,
          id: P1,
          ts: "2026-07-14T10:00:00.000Z",
          type: "PromptSubmitted",
          session: SES,
          actor: { kind: "human" },
          git: { head: "9fc1b2a", branch: "main", dirty: [] },
          payload: { text: "let's use JWT — add token auth to app.js" },
          meta: { provider: "example@1.0.0", workspace: WORKSPACE, schema: "PromptSubmitted/1", visibility: "shared" },
        },
      ] as never),
    );
    await createCheckpoint(repo, P1); // tree = "line1"
    writeFileSync(path.join(repo, "app.js"), "line1\nline2\n"); // P1's (open) turn changes app.js

    const pack = await withLog(chronicleDir, (log) => buildContextPack(chronicleDir, log, repo, "app.js"));

    expect(pack.empty).toBe(false);
    expect(pack.prompts.map((p) => p.eventId)).toEqual([P1]);
    expect(pack.prompts[0]?.text).toContain("let's use JWT");
    // The decision from that session rides along.
    expect(pack.knowledge.some((k) => k.kind === "decision" && k.text.includes("JWT"))).toBe(true);
    // The Markdown is the paste-ready deliverable.
    expect(pack.markdown).toContain("# Context for app.js");
    expect(pack.markdown).toContain("let's use JWT");
    expect(pack.markdown).toContain("never calls a model");
  });

  it("is honestly empty for a file nothing captured shaped", async () => {
    const { repo, chronicleDir } = await repoWithChronicle();
    const pack = await withLog(chronicleDir, (log) => buildContextPack(chronicleDir, log, repo, "app.js"));
    expect(pack.empty).toBe(true);
    expect(pack.prompts).toEqual([]);
    expect(pack.markdown).toContain("No captured history");
  });
});
