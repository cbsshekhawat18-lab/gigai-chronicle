/**
 * Tier-2 backfill — `chronicle import claude-code` (the five-minute aha,
 * J1). Idempotent by per-file line cursors; fingerprinted fail-soft: a
 * drifted transcript is skipped with a CaptureDegraded, never half-imported.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { openProviderEngine } from "@gigaichronicle/core/emit";
import { PROVIDER } from "./identity.js";
import { SessionMap } from "./session-map.js";
import { parseTranscript } from "./transcript.js";
import { transcriptDirsFor } from "./transcripts-location.js";

export interface BackfillOptions {
  /** Paths this workspace has lived at (current + WorkspaceMoved history). */
  knownWorkspacePaths: readonly string[];
  /** Override for tests and `--from <dir>` imports. */
  transcriptsRoot?: string;
}

export interface BackfillReport {
  filesSeen: number;
  filesImported: number;
  filesSkippedDrift: number;
  eventsImported: number;
  gaps: number;
}

interface BackfillState {
  files: Record<string, { importedLines: number; driftedAtLines?: number }>;
}

function stateFile(chronicleDir: string): string {
  return path.join(chronicleDir, ".local", "providers", "claude-code", "backfill.json");
}

function loadState(chronicleDir: string): BackfillState {
  try {
    return JSON.parse(readFileSync(stateFile(chronicleDir), "utf8")) as BackfillState;
  } catch {
    return { files: {} };
  }
}

function saveState(chronicleDir: string, state: BackfillState): void {
  const file = stateFile(chronicleDir);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(state, null, 2) + "\n", "utf8");
}

export async function runBackfill(
  chronicleDir: string,
  options: BackfillOptions,
): Promise<BackfillReport> {
  const report: BackfillReport = {
    filesSeen: 0,
    filesImported: 0,
    filesSkippedDrift: 0,
    eventsImported: 0,
    gaps: 0,
  };
  const state = loadState(chronicleDir);
  const sessionMap = SessionMap.load(chronicleDir);

  const dirs =
    options.transcriptsRoot !== undefined
      ? [options.transcriptsRoot, ...transcriptDirsFor(options.knownWorkspacePaths, options.transcriptsRoot)]
      : transcriptDirsFor(options.knownWorkspacePaths);

  const transcriptFiles: string[] = [];
  for (const dir of new Set(dirs)) {
    try {
      for (const entry of readdirSync(dir)) {
        if (entry.endsWith(".jsonl")) transcriptFiles.push(path.join(dir, entry));
      }
    } catch {
      continue; // no transcripts at this location — normal
    }
  }

  const engine = await openProviderEngine(chronicleDir, PROVIDER);
  try {
    for (const file of transcriptFiles.sort()) {
      report.filesSeen += 1;
      const lines = readFileSync(file, "utf8").split("\n");
      const fileState = state.files[file];
      const already = fileState?.importedLines ?? 0;
      if (lines.length <= already) continue; // fully imported
      if (fileState?.driftedAtLines !== undefined && lines.length <= fileState.driftedAtLines) {
        // Known-drifted and unchanged: already degraded once, stay quiet
        // until the file grows (or a newer parser ships and state is reset).
        report.filesSkippedDrift += 1;
        continue;
      }

      // Session identity: transcript filename is the tool session uuid.
      const uuid = path.basename(file, ".jsonl");
      const session = sessionMap.resolve(uuid);

      const fresh = lines.slice(already);
      const parsed = parseTranscript(fresh, session);
      if (parsed.drifted) {
        report.filesSkippedDrift += 1;
        await engine.reportDegraded(
          2,
          4,
          `transcript format drift in ${path.basename(file)} (${parsed.linesUnknown}/${parsed.linesTotal} unknown lines)`,
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
