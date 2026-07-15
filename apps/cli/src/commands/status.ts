import { readFileSync } from "node:fs";
import path from "node:path";
import { ChronicleIndex, EventLog, openWorkspace } from "@gigaichronicle/core";
import { configSchema } from "@gigaichronicle/schema";
import { EXIT_NOT_A_PROJECT, EXIT_OK, findChronicleDir, printJson } from "../context.js";

/** Provider support truth: which providers can actually capture today. */
const SUPPORTED_PROVIDERS = new Set<string>(["claude-code"]); // codex/gemini join in Phase 2

export async function runStatusCommand(global: { json?: boolean }): Promise<number> {
  const chronicleDir = findChronicleDir(process.cwd());
  if (chronicleDir === null) {
    console.error("not a chronicle project (no .chronicle directory found)");
    return EXIT_NOT_A_PROJECT;
  }

  const workspace = await openWorkspace(chronicleDir);
  const log = await EventLog.open(chronicleDir, {
    workspaceId: workspace.workspaceId,
    fsyncIntervalMs: 0,
  });
  const index = ChronicleIndex.open(chronicleDir);
  try {
    await index.catchUp(log);
    const freshness = await index.freshness(log);
    const sessions = index.sessions();

    const providers = readProviders(chronicleDir).map(([id, mode]) => ({
      id,
      mode,
      support: SUPPORTED_PROVIDERS.has(id) ? "available" : "arrives-later",
    }));

    if (global.json === true) {
      printJson("status", {
        project: { id: workspace.projectId, name: workspace.projectName },
        identity: { foreignRepo: workspace.foreignRepo, shallow: workspace.shallow },
        store: { events: freshness.eventsInLog, sessions: sessions.length },
        index: { fresh: freshness.fresh, eventsIndexed: freshness.eventsIndexed },
        capture: { providers },
      });
    } else {
      const providerLine =
        providers.length === 0
          ? "not initialized (`chronicle init`)"
          : providers
              .map(
                (p) =>
                  `${p.id}:${p.mode}${p.support === "arrives-later" ? " (provider arrives M7+)" : ""}`,
              )
              .join(" · ");
      console.log(
        [
          `project   ${workspace.projectName ?? "—"} ${workspace.projectId ?? "(no config yet)"}${workspace.foreignRepo ? "  ⚠ FOREIGN REPO" : ""}`,
          `events    ${freshness.eventsInLog} recorded · ${sessions.length} session(s)`,
          `index     ${freshness.fresh ? "fresh" : "STALE"} (${freshness.eventsIndexed} indexed)`,
          `capture   ${providerLine}`,
        ].join("\n"),
      );
    }
    return EXIT_OK;
  } finally {
    index.close();
    await log.close();
  }
}

function readProviders(chronicleDir: string): Array<[string, string]> {
  try {
    const raw = JSON.parse(readFileSync(path.join(chronicleDir, "config.json"), "utf8"));
    const config = configSchema.safeParse(raw);
    return config.success ? Object.entries(config.data.capture.providers) : [];
  } catch {
    return [];
  }
}
