/**
 * `chronicle import claude-code [--from <dir>]` — tier-2 backfill, the
 * five-minute aha (J1). Gathers every path this workspace has lived at
 * (current + WorkspaceMoved history) so transcripts recorded under old
 * folder names are found too.
 */
import path from "node:path";
import { EventLog, openWorkspace } from "@gigaichronicle/core";
import {
  EXIT_FAILURE,
  EXIT_NOT_A_PROJECT,
  EXIT_OK,
  findChronicleDir,
  printJson,
} from "../context.js";

async function knownWorkspacePaths(chronicleDir: string, workspaceId: string): Promise<string[]> {
  const paths = new Set<string>([path.dirname(chronicleDir)]);
  const log = await EventLog.open(chronicleDir, {
    workspaceId: workspaceId as never,
    fsyncIntervalMs: 0,
  });
  try {
    for await (const { event } of log.scan({ visibility: "local" })) {
      if (event.type === "WorkspaceMoved") {
        const moved = event.payload as { fromPath: string; toPath: string };
        paths.add(moved.fromPath);
        paths.add(moved.toPath);
      }
    }
  } finally {
    await log.close();
  }
  return [...paths];
}

export async function runImportCommand(
  providerId: string,
  options: { from?: string },
  global: { json?: boolean },
): Promise<number> {
  const chronicleDir = findChronicleDir(process.cwd());
  if (chronicleDir === null) {
    console.error("not a chronicle project (no .chronicle directory found)");
    return EXIT_NOT_A_PROJECT;
  }
  if (providerId !== "claude-code") {
    console.error(`import: provider "${providerId}" arrives in a later milestone (see PROVIDERS.md)`);
    return EXIT_FAILURE;
  }

  const workspace = await openWorkspace(chronicleDir);
  const { runBackfill } = await import("@gigaichronicle/provider-claude-code");
  const report = await runBackfill(chronicleDir, {
    knownWorkspacePaths: await knownWorkspacePaths(chronicleDir, workspace.workspaceId),
    ...(options.from !== undefined ? { transcriptsRoot: path.resolve(options.from) } : {}),
  });

  if (global.json === true) {
    printJson("import", { provider: providerId, report });
  } else {
    console.log(
      [
        `transcripts  ${report.filesSeen} seen · ${report.filesImported} imported · ${report.filesSkippedDrift} skipped (format drift)`,
        `events       ${report.eventsImported} imported${report.gaps > 0 ? ` · ${report.gaps} gap(s) recorded` : ""}`,
        report.eventsImported > 0
          ? `next         chronicle timeline   — your journey is already here`
          : `next         nothing new to import`,
      ].join("\n"),
    );
  }
  return EXIT_OK;
}
