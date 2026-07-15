/**
 * Correlation scenarios (§11, M9 DoD): expected links WITH expected
 * confidence — including the designed near-miss that must stay `inferred`
 * and never upgrade; trailer beats heuristics; LinkRejected severs
 * permanently across recomputes; hook chaining etiquette.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { newId, type SessionId } from "@gigaichronicle/schema";
import {
  ChronicleIndex,
  EventEngine,
  EventLog,
  fixedGitReader,
  hooksDirFor,
  installTrailerHook,
  recomputeLinks,
  uninstallTrailerHook,
} from "../src/index.js";
import { WORKSPACE } from "./helpers/events.js";

const roots: string[] = [];
function tempRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "chronicle corr "));
  roots.push(dir);
  git(dir, "init", "-q", "-b", "main");
  // Backdate the root commit: it must be DEMONSTRABLY outside any session
  // window (commit timestamps are second-precision — same-second timing
  // would be legitimately ambiguous, which is not what this fixture tests).
  execFileSync(
    "git",
    ["-c", "user.name=t", "-c", "user.email=t@t.invalid", "commit", "-q", "--allow-empty", "-m", "root"],
    { cwd: dir, env: { ...process.env, GIT_AUTHOR_DATE: "2020-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2020-01-01T00:00:00Z" } },
  );
  mkdirSync(path.join(dir, ".chronicle"));
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

let commitCounter = 0;
function commitFile(repo: string, file: string, message: string, trailer?: string): string {
  mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  writeFileSync(path.join(repo, file), `content ${++commitCounter}\n`);
  git(repo, "add", file);
  const fullMessage = trailer === undefined ? message : `${message}\n\nChronicle-Session: ${trailer}`;
  git(repo, "commit", "-q", "-m", fullMessage);
  return git(repo, "rev-parse", "--short", "HEAD").trim();
}

/** Session with FilesAccepted on `paths`, spanning "now". */
async function recordSession(repo: string, paths: string[]): Promise<SessionId> {
  const chronicleDir = path.join(repo, ".chronicle");
  const engine = await EventEngine.open(chronicleDir, {
    workspaceId: WORKSPACE,
    provider: { id: "example-tool", version: "1.0.0" },
    gitReader: fixedGitReader(),
    fsyncIntervalMs: 0,
  });
  const session = newId("session");
  await engine.emit({ type: "SessionStarted", session, actor: { kind: "human" }, payload: { title: "corr", resumedFrom: null } });
  await engine.emit({ type: "FilesAccepted", session, actor: { kind: "human" }, payload: { paths, responseEvent: null } });
  await engine.emit({ type: "SessionEnded", session, actor: { kind: "system" }, payload: { reason: "completed" } });
  await engine.close();
  return session;
}

async function links(repo: string): Promise<ReturnType<ChronicleIndex["commitLinks"]>> {
  const chronicleDir = path.join(repo, ".chronicle");
  const log = await EventLog.open(chronicleDir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
  const index = ChronicleIndex.open(chronicleDir);
  try {
    await index.catchUp(log);
    const report = await recomputeLinks(repo, log, index);
    return report.links as never;
  } finally {
    index.close();
    await log.close();
  }
}

describe("link scoring (§11)", () => {
  it("trailer → exact; dirty-set overlap → high; window-only → inferred; outside window → nothing", async () => {
    const repo = tempRepo();
    const session = await recordSession(repo, ["src/auth.ts"]);

    const exact = commitFile(repo, "anything.ts", "with trailer", session);
    const high = commitFile(repo, "src/auth.ts", "touches session file");
    const inferred = commitFile(repo, "unrelated.md", "in window, no overlap");

    const all = (await links(repo)) as Array<{ commit: string; session: string; confidence: string; source: string }>;
    const byCommit = new Map(all.map((l) => [l.commit, l]));
    expect(byCommit.get(exact)).toMatchObject({ session, confidence: "exact", source: "trailer" });
    expect(byCommit.get(high)).toMatchObject({ session, confidence: "high", source: "dirty-set" });
    // THE designed near-miss: same window, no file overlap — must stay inferred.
    expect(byCommit.get(inferred)).toMatchObject({ session, confidence: "inferred", source: "time-window" });
    // The root commit predates the session window — never linked.
    const rootSha = git(repo, "rev-list", "--max-parents=0", "--abbrev-commit", "HEAD").trim().slice(0, 7);
    expect(byCommit.has(rootSha)).toBe(false);
  });

  it("LinkRejected severs permanently across recomputes; LinkConfirmed overrides as exact/human", async () => {
    const repo = tempRepo();
    const chronicleDir = path.join(repo, ".chronicle");
    const session = await recordSession(repo, ["src/a.ts"]);
    const sha = commitFile(repo, "src/a.ts", "overlapping commit");

    let all = (await links(repo)) as Array<{ commit: string; confidence?: string }>;
    expect(all.find((l) => l.commit === sha)?.confidence).toBe("high");

    const engine = await EventEngine.open(chronicleDir, {
      workspaceId: WORKSPACE,
      provider: { id: "chronicle", version: "0" },
      gitReader: fixedGitReader(),
      fsyncIntervalMs: 0,
    });
    await engine.emit({ type: "LinkRejected", actor: { kind: "human" }, payload: { commit: sha, session } });
    await engine.close();

    all = (await links(repo)) as Array<{ commit: string; confidence?: string }>;
    expect(all.find((l) => l.commit === sha)).toBeUndefined(); // severed
    all = (await links(repo)) as Array<{ commit: string; confidence?: string }>;
    expect(all.find((l) => l.commit === sha)).toBeUndefined(); // …and stays severed

    const engine2 = await EventEngine.open(chronicleDir, {
      workspaceId: WORKSPACE,
      provider: { id: "chronicle", version: "0" },
      gitReader: fixedGitReader(),
      fsyncIntervalMs: 0,
    });
    await engine2.emit({ type: "LinkConfirmed", actor: { kind: "human" }, payload: { commit: sha, session } });
    await engine2.close();
    const final = (await links(repo)) as Array<{ commit: string; confidence: string; source: string }>;
    expect(final.find((l) => l.commit === sha)).toMatchObject({ confidence: "exact", source: "human" });
  });
});

describe("trailer hook etiquette (design law 9 exception)", () => {
  it("stamps commits while a session is active; chains with pre-existing hooks; uninstall restores", async () => {
    const repo = tempRepo();
    const chronicleDir = path.join(repo, ".chronicle");

    // Pre-existing hook (the husky-style case).
    const hookFile = path.join(hooksDirFor(repo), "prepare-commit-msg");
    mkdirSync(path.dirname(hookFile), { recursive: true });
    writeFileSync(hookFile, `#!/bin/sh\necho existing-hook-ran >> "${path.join(repo, "hook.log").replaceAll("\\", "/")}"\n`);
    execFileSync("chmod", ["+x", hookFile]);

    expect(installTrailerHook(repo)).toBe(true);
    expect(installTrailerHook(repo)).toBe(false); // idempotent

    // Active session → commit gets the trailer AND the old hook still runs.
    const engine = await EventEngine.open(chronicleDir, {
      workspaceId: WORKSPACE,
      provider: { id: "example-tool", version: "1.0.0" },
      gitReader: fixedGitReader(),
      fsyncIntervalMs: 0,
    });
    const session = newId("session");
    await engine.emit({ type: "SessionStarted", session, actor: { kind: "human" }, payload: { title: null, resumedFrom: null } });
    await engine.close();

    const sha = commitFile(repo, "work.ts", "work during session");
    const message = git(repo, "log", "-1", "--format=%B", sha);
    expect(message).toContain(`Chronicle-Session: ${session}`);
    expect(readFileSync(path.join(repo, "hook.log"), "utf8")).toContain("existing-hook-ran");

    // Session ends → marker gone → next commit unstamped (opt-in, per-moment).
    const engine2 = await EventEngine.open(chronicleDir, {
      workspaceId: WORKSPACE,
      provider: { id: "example-tool", version: "1.0.0" },
      gitReader: fixedGitReader(),
      fsyncIntervalMs: 0,
    });
    await engine2.emit({ type: "SessionEnded", session, actor: { kind: "system" }, payload: { reason: "completed" } });
    await engine2.close();
    const sha2 = commitFile(repo, "later.ts", "after session");
    expect(git(repo, "log", "-1", "--format=%B", sha2)).not.toContain("Chronicle-Session");

    // Uninstall removes exactly our block; the pre-existing hook survives.
    expect(uninstallTrailerHook(repo)).toBe(true);
    const restored = readFileSync(hookFile, "utf8");
    expect(restored).toContain("existing-hook-ran");
    expect(restored).not.toContain("chronicle prepare-commit-msg");
    expect(existsSync(hookFile)).toBe(true);
  });
});
