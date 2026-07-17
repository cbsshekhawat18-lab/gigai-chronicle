/**
 * Git-native shadow checkpoints (ADR-0012): snapshots never touch
 * HEAD/index/worktree/branches; restore is safety-checkpointed and honest
 * about files it cannot restore. Real git throughout.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkpointFor,
  createCheckpoint,
  listCheckpointedEvents,
  restoreCheckpoint,
  restorePreview,
} from "../src/index.js";

const dirs: string[] = [];
function repo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "chronicle ckpt "));
  dirs.push(dir);
  git(dir, "init", "-q", "-b", "main");
  // No user.name/email is configured here beyond the explicit -c flags —
  // this mirrors CI runners and proves checkpoints carry their own identity.
  writeFileSync(path.join(dir, "app.js"), "// two inputs\ninput1\ninput2\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "v1: two inputs");
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    "git",
    ["-c", "user.name=t", "-c", "user.email=t@t.invalid", "-c", "commit.gpgsign=false", ...args],
    { cwd, encoding: "utf8" },
  );
}

describe("shadow checkpoints", () => {
  it("checkpoint captures tracked+untracked WITHOUT touching HEAD/index/worktree", async () => {
    const dir = repo();
    writeFileSync(path.join(dir, "app.js"), "// five inputs\n1\n2\n3\n4\n5\n"); // modified
    writeFileSync(path.join(dir, "notes.txt"), "untracked scratch\n"); //          untracked
    const headBefore = git(dir, "rev-parse", "HEAD").trim();
    const statusBefore = git(dir, "status", "--porcelain");

    const sha = await createCheckpoint(dir, "evt_01AAAAAAAAAAAAAAAAAAAAAAAA");
    expect(sha).toMatch(/^[0-9a-f]{40}$/);

    // Nothing user-visible moved.
    expect(git(dir, "rev-parse", "HEAD").trim()).toBe(headBefore);
    expect(git(dir, "status", "--porcelain")).toBe(statusBefore);
    // The checkpoint contains both files' contents.
    expect(git(dir, "show", `${sha}:app.js`)).toContain("five inputs");
    expect(git(dir, "show", `${sha}:notes.txt`)).toContain("untracked scratch");
    expect(await checkpointFor(dir, "evt_01AAAAAAAAAAAAAAAAAAAAAAAA")).toBe(sha);
  });

  it("clean tree checkpoints as HEAD itself (no object churn)", async () => {
    const dir = repo();
    const sha = await createCheckpoint(dir, "evt_01BBBBBBBBBBBBBBBBBBBBBBBB");
    expect(sha).toBe(git(dir, "rev-parse", "HEAD").trim());
  });

  it("the founder scenario: v1 two inputs → five inputs → ⏪ back to two", async () => {
    const dir = repo();
    // Prompt 1 captured at the two-input state.
    const evt = "evt_01CCCCCCCCCCCCCCCCCCCCCCCC";
    await createCheckpoint(dir, evt);
    // Prompt 2 "improves" it to five inputs… and it is worse.
    writeFileSync(path.join(dir, "app.js"), "// five inputs\n1\n2\n3\n4\n5\n");

    expect(await restorePreview(dir, evt)).toEqual(["app.js"]);
    const result = await restoreCheckpoint(dir, evt);
    expect(readFileSync(path.join(dir, "app.js"), "utf8")).toContain("two inputs");
    expect(result.restored).toEqual(["app.js"]);

    // Nothing was lost: the safety checkpoint holds the five-input state.
    expect(git(dir, "show", `${result.safetyCheckpoint}:app.js`)).toContain("five inputs");
  });

  it("files created after the checkpoint are left in place and reported", async () => {
    const dir = repo();
    const evt = "evt_01DDDDDDDDDDDDDDDDDDDDDDDD";
    await createCheckpoint(dir, evt);
    writeFileSync(path.join(dir, "new-later.js"), "created after the checkpoint\n");
    const result = await restoreCheckpoint(dir, evt);
    expect(result.untouchedNewFiles).toEqual(["new-later.js"]);
    expect(existsSync(path.join(dir, "new-later.js"))).toBe(true); // honest v1 limit
  });

  it("no checkpoint → typed error; non-repo → silent null; listing works", async () => {
    const dir = repo();
    await expect(restoreCheckpoint(dir, "evt_01EEEEEEEEEEEEEEEEEEEEEEEE")).rejects.toMatchObject({
      name: "ChronicleError",
    });
    const notRepo = mkdtempSync(path.join(tmpdir(), "not a repo "));
    dirs.push(notRepo);
    expect(await createCheckpoint(notRepo, "evt_01FFFFFFFFFFFFFFFFFFFFFFFF")).toBeNull();

    await createCheckpoint(dir, "evt_01GGGGGGGGGGGGGGGGGGGGGGGG");
    const listed = await listCheckpointedEvents(dir);
    expect(listed.has("evt_01GGGGGGGGGGGGGGGGGGGGGGGG")).toBe(true);
  });
});
