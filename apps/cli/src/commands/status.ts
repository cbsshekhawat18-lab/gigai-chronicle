import { ChronicleIndex, EventLog, openWorkspace } from "@gigaichronicle/core";
import { EXIT_NOT_A_PROJECT, EXIT_OK, findChronicleDir, printJson } from "../context.js";
import { SUPPORTED_PROVIDERS, hookHealth, readProviders } from "../capture-health.js";

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
    // `claude-code:auto` is CONFIG, not proof of capture: without the hooks
    // — or with hooks but no `chronicle` on PATH for them to run — nothing is
    // ever recorded and the project still looks healthy. Report what records.
    const hooks = await hookHealth(chronicleDir);

    if (global.json === true) {
      printJson("status", {
        project: { id: workspace.projectId, name: workspace.projectName },
        identity: { foreignRepo: workspace.foreignRepo, shallow: workspace.shallow },
        store: { events: freshness.eventsInLog, sessions: sessions.length },
        index: { fresh: freshness.fresh, eventsIndexed: freshness.eventsIndexed },
        capture: { providers, hooks },
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
          ...(hooks.expected
            ? [
                `hooks     ${
                  hooks.status === "live"
                    ? `installed (${hooks.scope} scope) — capture is live`
                    : hooks.status === "cli-missing"
                      ? `⚠ installed (${hooks.scope} scope) BUT \`chronicle\` is not on PATH — nothing is being recorded (install: npm i -g gigai-chronicle)`
                      : "NOT INSTALLED — nothing is being recorded (`chronicle hooks install claude-code`)"
                }`,
              ]
            : []),
        ].join("\n"),
      );
    }
    return EXIT_OK;
  } finally {
    index.close();
    await log.close();
  }
}
