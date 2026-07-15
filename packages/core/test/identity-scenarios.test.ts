/**
 * The §6 scenario table as an automated suite (M6 DoD #1): rename, move,
 * clone, fork/second-remote, two clones, worktrees, no-remote, foreign.
 * Real git repos, real clones — and the suite itself runs under a parent
 * directory WITH A SPACE in its name (DoD #4).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, renameSync, rmSync, cpSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EventLog, openWorkspace, runInit } from "../src/index.js";

const roots: string[] = [];
function spacedBase(): string {
  const base = mkdtempSync(path.join(tmpdir(), "chronicle id suite ")); // deliberate spaces
  roots.push(base);
  return base;
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

/** Fresh initialized chronicle repo with one commit including .chronicle. */
async function makeProject(base: string, name: string): Promise<string> {
  const repo = path.join(base, name);
  mkdirSync(repo);
  git(repo, "init", "-q", "-b", "main");
  git(repo, "commit", "-q", "--allow-empty", "-m", "root");
  await runInit(repo, { detectedProviders: { "example-tool": "auto" } });
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "chronicle init");
  return repo;
}

const machine = (repo: string): { workspace: string } =>
  JSON.parse(readFileSync(path.join(repo, ".chronicle", ".local", "machine.json"), "utf8"));

async function eventTypes(repo: string, visibility: "shared" | "local" | "all"): Promise<string[]> {
  const ctx = await openWorkspace(path.join(repo, ".chronicle"));
  const log = await EventLog.open(path.join(repo, ".chronicle"), {
    workspaceId: ctx.workspaceId as never,
    fsyncIntervalMs: 0,
  });
  const types: string[] = [];
  for await (const { event } of log.scan({ visibility })) types.push(event.type);
  await log.close();
  return types;
}

// Real-git e2e: each scenario runs several git subprocesses, which slow
// markedly under full-workspace parallel test load — e2e timeout, not 5s.
describe("identity scenarios (§6 table)", { timeout: 60_000 }, () => {
  it("1+2: rename and move — everything survives, WorkspaceMoved recorded once", async () => {
    const base = spacedBase();
    const repo = await makeProject(base, "original-name");
    const before = machine(repo).workspace;

    const renamed = path.join(base, "renamed name with spaces");
    renameSync(repo, renamed);
    const ctx = await openWorkspace(path.join(renamed, ".chronicle"));

    expect(ctx.workspaceId).toBe(before); // same clone, same workspace
    expect(ctx.moved).toMatchObject({ toPath: renamed });
    expect(ctx.foreignRepo).toBe(false);

    const nested = path.join(base, "sub dir");
    mkdirSync(nested);
    const moved = path.join(nested, "moved-again");
    renameSync(renamed, moved);
    const ctx2 = await openWorkspace(path.join(moved, ".chronicle"));
    expect(ctx2.moved).toMatchObject({ fromPath: renamed, toPath: moved });

    const locals = await eventTypes(moved, "local");
    expect(locals.filter((t) => t === "WorkspaceMoved")).toHaveLength(2);
    expect((await eventTypes(moved, "shared"))[0]).toBe("ProjectCreated"); // history intact
  });

  it("3: clone — fresh workspace id, same project id, full shared history", async () => {
    const base = spacedBase();
    const origin = await makeProject(base, "origin-repo");
    const clone = path.join(base, "the clone");
    git(base, "clone", "-q", origin, clone);

    const ctx = await openWorkspace(path.join(clone, ".chronicle"));
    expect(ctx.workspaceId).not.toBe(machine(origin).workspace); // new wks_
    expect(ctx.projectId).toBe((await openWorkspace(path.join(origin, ".chronicle"))).projectId);
    expect(ctx.foreignRepo).toBe(false); // same roots
    expect(await eventTypes(clone, "shared")).toContain("ProjectCreated"); // journey traveled
  });

  it("4: fork / second remote — remotes drift, root anchor holds, never foreign", async () => {
    const base = spacedBase();
    const origin = await makeProject(base, "upstream");
    const clone = path.join(base, "fork-clone");
    git(base, "clone", "-q", origin, clone);
    await openWorkspace(path.join(clone, ".chronicle")); // records fingerprint

    git(clone, "remote", "add", "fork", "git@example.com:me/fork.git");
    const ctx = await openWorkspace(path.join(clone, ".chronicle"));
    expect(ctx.foreignRepo).toBe(false);

    const state = JSON.parse(
      readFileSync(path.join(clone, ".chronicle", ".local", "machine.json"), "utf8"),
    ) as { repository: { remotes: string[] } };
    expect(state.repository.remotes).toContain("example.com/me/fork");
  });

  it("5: two clones on one machine — distinct workspaces, no collisions", async () => {
    const base = spacedBase();
    const origin = await makeProject(base, "origin2");
    const cloneA = path.join(base, "clone-a");
    const cloneB = path.join(base, "clone-b");
    git(base, "clone", "-q", origin, cloneA);
    git(base, "clone", "-q", origin, cloneB);
    const a = await openWorkspace(path.join(cloneA, ".chronicle"));
    const b = await openWorkspace(path.join(cloneB, ".chronicle"));
    expect(a.workspaceId).not.toBe(b.workspaceId);
    expect(a.projectId).toBe(b.projectId);
  });

  it("6: worktrees — each worktree is its own workspace (fresh .local)", async () => {
    const base = spacedBase();
    const repo = await makeProject(base, "wt-main");
    const worktree = path.join(base, "wt-branch");
    git(repo, "worktree", "add", "-q", "-b", "feature", worktree);
    const main = await openWorkspace(path.join(repo, ".chronicle"));
    const wt = await openWorkspace(path.join(worktree, ".chronicle"));
    expect(wt.workspaceId).not.toBe(main.workspaceId);
    expect(wt.projectId).toBe(main.projectId);
    expect(wt.foreignRepo).toBe(false);
  });

  it("7: no remote — roots-only fingerprint, fully functional", async () => {
    const base = spacedBase();
    const repo = await makeProject(base, "loner");
    const ctx = await openWorkspace(path.join(repo, ".chronicle"));
    expect(ctx.foreignRepo).toBe(false);
    const state = JSON.parse(
      readFileSync(path.join(repo, ".chronicle", ".local", "machine.json"), "utf8"),
    ) as { repository: { roots: string[]; remotes: string[]; digest: string | null } };
    expect(state.repository.roots).toHaveLength(1);
    expect(state.repository.remotes).toEqual([]);
    expect(state.repository.digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("8: .chronicle copied into an unrelated repo — flagged foreign, never merged silently", async () => {
    const base = spacedBase();
    const donor = await makeProject(base, "donor");
    await openWorkspace(path.join(donor, ".chronicle")); // record donor roots

    const stranger = path.join(base, "stranger");
    mkdirSync(stranger);
    git(stranger, "init", "-q", "-b", "main");
    git(stranger, "commit", "-q", "--allow-empty", "-m", "unrelated root");
    // Copy the whole .chronicle INCLUDING .local (the recorded identity).
    cpSync(path.join(donor, ".chronicle"), path.join(stranger, ".chronicle"), { recursive: true });

    const ctx = await openWorkspace(path.join(stranger, ".chronicle"));
    expect(ctx.foreignRepo).toBe(true);
  });
});
