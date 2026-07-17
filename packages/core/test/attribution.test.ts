/**
 * Intent attribution (ADR-0013): the diff between consecutive checkpoints is
 * the work of the EARLIER prompt's turn, because a checkpoint is taken WHEN
 * a prompt is submitted. Real git throughout — the whole feature is derived
 * from refs, so a mocked git would test nothing.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { changesByPrompt, createCheckpoint, listCheckpoints, parseNumstat } from "../src/index.js";

// ULIDs sort lexicographically by time; these stand in for three prompts.
const P1 = "evt_01AAAAAAAAAAAAAAAAAAAAAAAA";
const P2 = "evt_01BBBBBBBBBBBBBBBBBBBBBBBB";
const P3 = "evt_01CCCCCCCCCCCCCCCCCCCCCCCC";

const dirs: string[] = [];
function repo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "chronicle why "));
  dirs.push(dir);
  git(dir, "init", "-q", "-b", "main");
  writeFileSync(path.join(dir, "app.js"), "line1\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "v1");
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

function write(dir: string, file: string, body: string): void {
  writeFileSync(path.join(dir, file), body);
}

describe("intent attribution", () => {
  it("attributes a turn's diff to the prompt that STARTED it, not the one that ended it", async () => {
    const dir = repo();
    await createCheckpoint(dir, P1); // P1 submitted — tree is "line1"
    write(dir, "app.js", "line1\nline2\n"); //   P1's turn adds line2
    await createCheckpoint(dir, P2); // P2 submitted — tree is "line1 line2"
    write(dir, "app.js", "line1\nline2\nline3\n"); // P2's turn adds line3
    await createCheckpoint(dir, P3); // P3 submitted; its turn has done nothing yet

    const changes = await changesByPrompt(dir, { path: "app.js" });

    // P3 changed nothing → omitted entirely. The off-by-one is the feature.
    expect(changes.map((c) => c.eventId)).toEqual([P1, P2]);
    expect(changes[0]?.files).toEqual([{ path: "app.js", insertions: 1, deletions: 0 }]);
    expect(changes[1]?.files).toEqual([{ path: "app.js", insertions: 1, deletions: 0 }]);
    // Both turns are closed: each has a successor checkpoint.
    expect(changes.every((c) => c.to !== null)).toBe(true);
  });

  it("the newest turn is still open — it compares against the working tree", async () => {
    const dir = repo();
    await createCheckpoint(dir, P1);
    write(dir, "app.js", "line1\nline2\n"); // uncommitted, no successor checkpoint

    const changes = await changesByPrompt(dir, { path: "app.js" });
    expect(changes).toHaveLength(1);
    expect(changes[0]?.eventId).toBe(P1);
    expect(changes[0]?.to).toBeNull(); // null = the live tree
    expect(changes[0]?.files).toEqual([{ path: "app.js", insertions: 1, deletions: 0 }]);
  });

  it("attribution survives a commit inside the turn (checkpoints span HEAD moves)", async () => {
    const dir = repo();
    await createCheckpoint(dir, P1);
    write(dir, "app.js", "line1\nline2\n");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "the turn's work, committed"); // HEAD moves mid-turn
    await createCheckpoint(dir, P2);

    const changes = await changesByPrompt(dir, { path: "app.js" });
    expect(changes.map((c) => c.eventId)).toEqual([P1]);
    expect(changes[0]?.files).toEqual([{ path: "app.js", insertions: 1, deletions: 0 }]);
  });

  it("narrows to the asked path and ignores turns that touched only other files", async () => {
    const dir = repo();
    await createCheckpoint(dir, P1);
    write(dir, "other.js", "unrelated\n"); // P1's turn touches only other.js
    await createCheckpoint(dir, P2);
    write(dir, "app.js", "line1\nline2\n"); // P2's turn touches app.js
    await createCheckpoint(dir, P3);

    expect((await changesByPrompt(dir, { path: "app.js" })).map((c) => c.eventId)).toEqual([P2]);
    expect((await changesByPrompt(dir, { path: "other.js" })).map((c) => c.eventId)).toEqual([P1]);
    // Unscoped sees both turns.
    expect((await changesByPrompt(dir)).map((c) => c.eventId)).toEqual([P1, P2]);
  });

  it("never attributes Chronicle's own store — the journal is not code", async () => {
    const dir = repo();
    await createCheckpoint(dir, P1);
    write(dir, "app.js", "line1\nline2\n");
    mkdirSync(path.join(dir, ".chronicle"), { recursive: true });
    write(dir, ".chronicle/noise.jsonl", '{"event":"noise"}\n');
    await createCheckpoint(dir, P2);

    const changes = await changesByPrompt(dir);
    expect(changes.flatMap((c) => c.files.map((f) => f.path))).toEqual(["app.js"]);
  });

  it("limit stops the newest-first scan and results stay oldest-first", async () => {
    const dir = repo();
    for (const [i, evt] of [P1, P2, P3].entries()) {
      await createCheckpoint(dir, evt);
      write(dir, "app.js", `${"line\n".repeat(i + 2)}`);
    }
    // Three open-ended turns; the newest two are P2 and P3.
    const changes = await changesByPrompt(dir, { path: "app.js", limit: 2 });
    expect(changes.map((c) => c.eventId)).toEqual([P2, P3]);
  });

  it("no checkpoints, or a path nothing touched, is an empty answer — never an error", async () => {
    const dir = repo();
    expect(await changesByPrompt(dir)).toEqual([]);
    await createCheckpoint(dir, P1);
    write(dir, "app.js", "line1\nline2\n");
    expect(await changesByPrompt(dir, { path: "never-existed.js" })).toEqual([]);

    const notRepo = mkdtempSync(path.join(tmpdir(), "not a repo "));
    dirs.push(notRepo);
    expect(await changesByPrompt(notRepo)).toEqual([]);
  });

  it("listCheckpoints returns commits in ULID (chronological) order", async () => {
    const dir = repo();
    // Created out of order on purpose — the sort is the contract.
    await createCheckpoint(dir, P3);
    write(dir, "app.js", "a\n");
    await createCheckpoint(dir, P1);
    write(dir, "app.js", "b\n");
    await createCheckpoint(dir, P2);

    const refs = await listCheckpoints(dir);
    expect(refs.map((r) => r.eventId)).toEqual([P1, P2, P3]);
    expect(refs.every((r) => /^[0-9a-f]{40}$/.test(r.commit))).toBe(true);
  });

  it("parseNumstat reports binary files as null churn, not zero", () => {
    expect(parseNumstat("12\t3\tsrc/a.ts\n-\t-\ticon.png\n")).toEqual([
      { path: "src/a.ts", insertions: 12, deletions: 3 },
      { path: "icon.png", insertions: null, deletions: null },
    ]);
    expect(parseNumstat("")).toEqual([]);
  });
});
