/**
 * Session git activity parsing — the Commits/Files tabs read real git history
 * (no provider emits git/file events). The parser must dedup files newest-first,
 * exclude the store's own `.chronicle/`, resolve renames to their destination,
 * and normalize commit dates to UTC so they sort beside event timestamps.
 */
import { describe, expect, it } from "vitest";
import { parseSessionGitLog } from "../src/index.js";

const REC = "\x01";
const SEP = "\x1f";
const commit = (sha: string, iso: string, subject: string): string =>
  `${REC}${sha}${SEP}${iso}${SEP}${subject}`;

describe("session git activity parser", () => {
  it("extracts commits + distinct files, newest-first, with UTC timestamps", () => {
    const log = [
      commit("abc123def4567890", "2026-07-25T23:29:39+05:30", "docs: update readme"),
      "M\tREADME.md",
      "A\tdocs/GUIDE.md",
      "",
      commit("fed987cba6543210", "2026-07-24T10:00:00+05:30", "feat: auth"),
      "M\tsrc/auth.ts",
      "M\tREADME.md", // already seen (newer commit) — deduped
      "R100\tsrc/old.ts\tsrc/new.ts", // rename resolves to destination
      "D\t.chronicle/prompts/x/prompt.md", // the store is excluded
    ].join("\n");

    const { commits, files } = parseSessionGitLog(log);

    expect(commits.map((c) => c.sha)).toEqual(["abc123def", "fed987cba"]); // short (9)
    expect(commits[0]).toMatchObject({ subject: "docs: update readme" });
    expect(commits[0]?.ts).toBe("2026-07-25T17:59:39.000Z"); // +05:30 → UTC Z

    expect(files.map((f) => `${f.status}:${f.path}`)).toEqual([
      "modified:README.md",
      "added:docs/GUIDE.md",
      "modified:src/auth.ts",
      "renamed:src/new.ts",
    ]);
    // README.md kept its FIRST (newest) touch's timestamp, not the older one.
    expect(files.find((f) => f.path === "README.md")?.ts).toBe("2026-07-25T17:59:39.000Z");
  });

  it("caps commits and files, and tolerates empty input", () => {
    expect(parseSessionGitLog("")).toEqual({ commits: [], files: [] });
    const many = Array.from({ length: 5 }, (_, i) =>
      [commit(`sha${i}0000000`, "2026-07-25T00:00:00Z", `c${i}`), `M\tf${i}.ts`].join("\n"),
    ).join("\n");
    const { commits, files } = parseSessionGitLog(many, { maxCommits: 2, maxFiles: 3 });
    expect(commits).toHaveLength(2);
    expect(files).toHaveLength(3);
  });
});
