/**
 * One-shot git queries for the identity model (§6, ADR-0009). System git
 * only, null-safe outside repositories.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

async function git(repoRoot: string, ...args: string[]): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["-C", repoRoot, ...args], {
      encoding: "utf8",
      timeout: 5_000,
    });
    return stdout;
  } catch {
    return null;
  }
}

export async function isGitRepository(dir: string): Promise<boolean> {
  return (await git(dir, "rev-parse", "--git-dir")) !== null;
}

/** Full SHAs of parentless commits; empty for unborn HEAD or errors. */
export async function rootCommits(repoRoot: string): Promise<string[]> {
  const out = await git(repoRoot, "rev-list", "--max-parents=0", "HEAD");
  if (out === null) return [];
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[0-9a-f]{40}$/.test(line));
}

export async function isShallowRepository(repoRoot: string): Promise<boolean> {
  return (await git(repoRoot, "rev-parse", "--is-shallow-repository"))?.trim() === "true";
}

/** Fetch URLs from `git remote -v`, deduplicated, unsorted/unnormalized. */
export async function remoteFetchUrls(repoRoot: string): Promise<string[]> {
  const out = await git(repoRoot, "remote", "-v");
  if (out === null) return [];
  const urls = new Set<string>();
  for (const line of out.split("\n")) {
    const match = /^\S+\t(\S+)\s+\(fetch\)$/.exec(line.trim());
    if (match !== null) urls.add(match[1] as string);
  }
  return [...urls];
}
