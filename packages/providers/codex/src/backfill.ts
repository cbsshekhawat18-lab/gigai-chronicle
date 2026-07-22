/**
 * Tier-2 backfill — `chronicle import codex`. Reads existing Codex rollouts
 * (nothing is installed into Codex), idempotent by per-file line cursors, and
 * fingerprinted fail-soft: a drifted rollout is skipped with a CaptureDegraded
 * rather than half-imported.
 *
 * Codex stores rollouts GLOBALLY, so each file is scoped to this repo by its
 * recorded `cwd` before anything is imported — a session from another project
 * never leaks into this one.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openProviderEngine } from "@gigaichronicle/core/emit";
import { PROVIDER } from "./identity.js";
import { codexSessionsRoot, findRolloutFiles } from "./locations.js";
import { parseRollout, readRolloutMeta, ROLLOUT_PARSER_VERSION } from "./rollout.js";
import { SessionMap } from "./session-map.js";

export interface BackfillOptions {
  /** Paths this workspace has lived at (current + WorkspaceMoved history). */
  knownWorkspacePaths: readonly string[];
  /** Override for tests and `--from <dir>` imports. */
  rolloutsRoot?: string;
}

export interface BackfillReport {
  filesSeen: number;
  filesForeign: number;
  filesImported: number;
  filesSkippedDrift: number;
  eventsImported: number;
  gaps: number;
}

interface BackfillState {
  parserVersion?: number;
  files: Record<string, { importedLines: number; driftedAtLines?: number }>;
}

function stateFile(chronicleDir: string): string {
  return path.join(chronicleDir, ".local", "providers", "codex", "backfill.json");
}

function loadState(chronicleDir: string): BackfillState {
  try {
    const state = JSON.parse(readFileSync(stateFile(chronicleDir), "utf8")) as BackfillState;
    if (state.parserVersion !== ROLLOUT_PARSER_VERSION) {
      // Newer parser: drop stale drift watermarks so drifted files retry;
      // keep import cursors (already-imported lines stay imported).
      const files: BackfillState["files"] = {};
      for (const [file, entry] of Object.entries(state.files)) {
        files[file] = { importedLines: entry.importedLines };
      }
      return { parserVersion: ROLLOUT_PARSER_VERSION, files };
    }
    return state;
  } catch {
    return { parserVersion: ROLLOUT_PARSER_VERSION, files: {} };
  }
}

function saveState(chronicleDir: string, state: BackfillState): void {
  state.parserVersion = ROLLOUT_PARSER_VERSION;
  const file = stateFile(chronicleDir);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(state, null, 2) + "\n", "utf8");
}

function withinWorkspace(cwd: string | null, workspacePaths: readonly string[]): boolean {
  if (cwd === null) return false;
  return workspacePaths.some((p) => cwd === p || cwd.startsWith(p + path.sep));
}

export async function runBackfill(
  chronicleDir: string,
  options: BackfillOptions,
): Promise<BackfillReport> {
  const report: BackfillReport = {
    filesSeen: 0,
    filesForeign: 0,
    filesImported: 0,
    filesSkippedDrift: 0,
    eventsImported: 0,
    gaps: 0,
  };
  const state = loadState(chronicleDir);
  const sessionMap = SessionMap.load(chronicleDir);
  const files = findRolloutFiles(options.rolloutsRoot ?? codexSessionsRoot());

  const engine = await openProviderEngine(chronicleDir, PROVIDER);
  try {
    for (const file of files) {
      report.filesSeen += 1;
      const lines = readFileSync(file, "utf8").split("\n");

      // Scope to this repo BEFORE any import — Codex rollouts are global.
      const meta = readRolloutMeta(lines);
      if (!withinWorkspace(meta.cwd, options.knownWorkspacePaths)) {
        report.filesForeign += 1;
        continue;
      }

      const fileState = state.files[file];
      const already = fileState?.importedLines ?? 0;
      if (lines.length <= already) continue; // fully imported
      if (fileState?.driftedAtLines !== undefined && lines.length <= fileState.driftedAtLines) {
        report.filesSkippedDrift += 1;
        continue;
      }

      const uuid = meta.toolSessionUuid ?? path.basename(file, ".jsonl");
      const atMs = meta.startedTs !== null ? Date.parse(meta.startedTs) : undefined;
      const session = sessionMap.resolve(uuid, Number.isNaN(atMs) ? undefined : atMs);

      const fresh = lines.slice(already);
      const parsed = parseRollout(fresh, session);
      if (already > 0) {
        // Incremental batch: session already open — a second SessionStarted
        // would wipe its title on replay.
        parsed.candidates = parsed.candidates.filter((c) => c.type !== "SessionStarted");
      }
      if (parsed.drifted) {
        report.filesSkippedDrift += 1;
        await engine.reportDegraded(
          2,
          4,
          `codex rollout format drift in ${path.basename(file)} (${parsed.linesUnknown}/${parsed.linesTotal} unknown lines)`,
        );
        state.files[file] = { importedLines: already, driftedAtLines: lines.length };
        saveState(chronicleDir, state);
        continue;
      }

      let imported = 0;
      for (const candidate of parsed.candidates) {
        const result = await engine.emit(candidate);
        if (result.accepted) imported += 1;
        else report.gaps += 1;
      }
      report.eventsImported += imported;
      if (imported > 0) report.filesImported += 1;
      state.files[file] = { importedLines: lines.length };
      saveState(chronicleDir, state);
    }
  } finally {
    await engine.close();
  }
  return report;
}
