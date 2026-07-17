/** Prompt library (§5.4, ADR-0011): versioning, immutability, hand-edit
 *  tolerance, and the plain-text diff. */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getPrompt,
  listPrompts,
  parsePrompt,
  promptVersions,
  savePrompt,
  unifiedDiff,
} from "../src/index.js";
import { makeTempChronicleDir } from "./helpers/events.js";

const dirs: string[] = [];
function tempDir(): string {
  const dir = makeTempChronicleDir("chronicle-prompts-");
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("prompt library", () => {
  it("save → v1; save again → v2; versions are immutable files", async () => {
    const dir = tempDir();
    const v1 = await savePrompt(dir, {
      slug: "auth-review",
      title: "Auth middleware review checklist",
      tags: ["security", "review"],
      body: "Review this middleware for token-handling flaws.",
    });
    expect(v1).toMatchObject({ slug: "auth-review", version: 1, tags: ["security", "review"] });
    expect(v1.id).toMatch(/^prm_/);

    const v2 = await savePrompt(dir, {
      slug: "auth-review",
      body: "Review this middleware for token-handling flaws.\nCheck refresh rotation too.",
    });
    expect(v2.version).toBe(2);
    expect(v2.id).toBe(v1.id); //          same prompt identity
    expect(v2.title).toBe(v1.title); //    metadata carries forward

    expect(await promptVersions(dir, "auth-review")).toEqual([1, 2]);
    const frozen = await getPrompt(dir, "auth-review", 1);
    expect(frozen.body).toBe("Review this middleware for token-handling flaws.");
    const current = await getPrompt(dir, "auth-review");
    expect(current.version).toBe(2);

    // Files are plain markdown with frontmatter — curated, greppable.
    const onDisk = readFileSync(path.join(dir, "prompts", "auth-review", "prompt.md"), "utf8");
    expect(onDisk.startsWith("---\n")).toBe(true);
    expect(onDisk).toContain("tags: [security, review]");
  });

  it("saving identical content is a no-op version-wise", async () => {
    const dir = tempDir();
    await savePrompt(dir, { slug: "p", body: "same" });
    const again = await savePrompt(dir, { slug: "p", body: "same" });
    expect(again.version).toBe(1);
    expect(await promptVersions(dir, "p")).toEqual([1]);
  });

  it("hand-edited prompt.md snapshots as the next version on body-less save", async () => {
    const dir = tempDir();
    await savePrompt(dir, { slug: "edited", body: "original" });
    // Human edits prompt.md in their editor (curated file — theirs to edit).
    const file = path.join(dir, "prompts", "edited", "prompt.md");
    const content = readFileSync(file, "utf8").replace("original", "hand-tuned wording");
    writeFileSync(file, content);

    const snap = await savePrompt(dir, { slug: "edited" }); // no body: snapshot current
    expect(snap.version).toBe(2);
    expect((await getPrompt(dir, "edited", 2)).body).toBe("hand-tuned wording");
    expect((await getPrompt(dir, "edited", 1)).body).toBe("original");
  });

  it("rejects bad slugs and empty bodies; list returns all prompts", async () => {
    const dir = tempDir();
    await expect(savePrompt(dir, { slug: "Bad Slug!", body: "x" })).rejects.toMatchObject({
      name: "ChronicleError",
    });
    await expect(savePrompt(dir, { slug: "empty" })).rejects.toMatchObject({
      name: "ChronicleError",
    });
    await savePrompt(dir, { slug: "a", body: "1" });
    await savePrompt(dir, { slug: "b", body: "2" });
    expect((await listPrompts(dir)).map((p) => p.slug)).toEqual(["a", "b"]);
  });

  it("parsePrompt tolerates unknown frontmatter keys; garbage returns null", () => {
    const ok = parsePrompt("---\nslug: x\nversion: 3\nfutureKey: kept\n---\nbody");
    expect(ok).toMatchObject({ slug: "x", version: 3, body: "body" });
    expect(parsePrompt("no frontmatter at all")).toBeNull();
    expect(parsePrompt("---\nslug: BAD SLUG\nversion: 1\n---\nx")).toBeNull();
  });

  it("unifiedDiff shows line-level +/- and detects identical inputs", () => {
    const diff = unifiedDiff("a\nb\nc", "a\nB\nc\nd", "v1", "v2");
    expect(diff).toContain("--- v1");
    expect(diff).toContain("- b");
    expect(diff).toContain("+ B");
    expect(diff).toContain("+ d");
    expect(diff).toContain("  a");
    expect(unifiedDiff("same", "same", "v1", "v2")).toContain("identical");
  });

  it("empty store: list is empty, versions dir tolerated missing", async () => {
    const dir = tempDir();
    mkdirSync(path.join(dir, "prompts"), { recursive: true });
    expect(await listPrompts(dir)).toEqual([]);
    expect(await promptVersions(dir, "nope")).toEqual([]);
    expect(readdirSync(path.join(dir, "prompts"))).toEqual([]);
  });
});
