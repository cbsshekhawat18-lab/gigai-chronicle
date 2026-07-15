/**
 * Git snapshot reader — enrichment input (§9 stage 3). Minimal in M5: HEAD,
 * branch, dirty paths, via the system git binary only (no native bindings —
 * §11), cached for the 200ms debounce window so the capture hot path never
 * shells out per event. M9 (correlation) extends this module.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitState } from "@gigaichronicle/schema";

const exec = promisify(execFile);

export interface GitReader {
  snapshot(): Promise<GitState>;
}

const CACHE_TTL_MS = 200;

const EMPTY: GitState = { head: null, branch: null, dirty: [] };

/** Reader for the repository at `repoRoot`; degrades to nulls outside git. */
export function createGitReader(repoRoot: string): GitReader {
  let cached: GitState | null = null;
  let cachedAt = 0;

  async function git(...args: string[]): Promise<string | null> {
    try {
      const { stdout } = await exec("git", ["-C", repoRoot, ...args], {
        encoding: "utf8",
        timeout: 2_000,
      });
      return stdout;
    } catch {
      return null;
    }
  }

  return {
    async snapshot(): Promise<GitState> {
      const now = Date.now();
      if (cached !== null && now - cachedAt < CACHE_TTL_MS) return cached;

      const [head, branch, status] = await Promise.all([
        git("rev-parse", "--short", "HEAD"),
        git("rev-parse", "--abbrev-ref", "HEAD"),
        git("status", "--porcelain", "-z"),
      ]);
      if (head === null && branch === null && status === null) {
        cached = EMPTY;
        cachedAt = now;
        return EMPTY;
      }

      const dirty =
        status === null
          ? []
          : status
              .split("\0")
              .filter((entry) => entry.length > 3)
              .map((entry) => entry.slice(3))
              // rename entries are "new -> old"; keep the current path
              .map((p) => (p.includes(" -> ") ? (p.split(" -> ")[0] as string) : p));

      const branchName = branch?.trim() ?? null;
      cached = {
        head: head?.trim().toLowerCase() ?? null,
        branch: branchName === "HEAD" ? null : branchName, // detached
        dirty,
      };
      cachedAt = now;
      return cached;
    },
  };
}

/** Fixed-state reader for tests and non-repo stores. */
export function fixedGitReader(state: GitState = EMPTY): GitReader {
  return { snapshot: async () => state };
}
