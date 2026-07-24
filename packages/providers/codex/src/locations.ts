/**
 * Where Codex CLI keeps rollouts: `~/.codex/sessions/YYYY/MM/rollout-*.jsonl`,
 * globally across every project. Because the store is global, the backfill
 * filters by each rollout's recorded `cwd` (rollout.ts) so only sessions that
 * ran in THIS repo are imported.
 */
import { readdirSync, type Dirent } from "node:fs";
import os from "node:os";
import path from "node:path";

/** Default rollout root; overridable for `--from <dir>` and tests. */
export function codexSessionsRoot(): string {
  return path.join(os.homedir(), ".codex", "sessions");
}

/** Every `*.jsonl` rollout under `root`, recursively, sorted for determinism. */
export function findRolloutFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // missing / unreadable dir — normal (no Codex history here)
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) out.push(full);
    }
  };
  walk(root);
  return out.sort();
}
