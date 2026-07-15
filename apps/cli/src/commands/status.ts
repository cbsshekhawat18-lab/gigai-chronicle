import { ChronicleIndex, EventLog } from "@gigaichronicle/core";
import {
  EXIT_NOT_A_PROJECT,
  EXIT_OK,
  findChronicleDir,
  printJson,
  resolveWorkspaceId,
} from "../context.js";

export async function runStatusCommand(global: { json?: boolean }): Promise<number> {
  const chronicleDir = findChronicleDir(process.cwd());
  if (chronicleDir === null) {
    console.error("not a chronicle project (no .chronicle directory found)");
    return EXIT_NOT_A_PROJECT;
  }

  const log = await EventLog.open(chronicleDir, {
    workspaceId: resolveWorkspaceId(chronicleDir),
    fsyncIntervalMs: 0,
  });
  const index = ChronicleIndex.open(chronicleDir);
  try {
    await index.catchUp(log);
    const freshness = await index.freshness(log);
    const sessions = index.sessions();

    // Honest placeholder until providers land: nothing is capturing yet, and
    // status says so instead of pretending (M6 wires config, M7 the first
    // live provider).
    const capture = { providers: [], note: "no capture providers installed yet (M6/M7)" };

    if (global.json === true) {
      printJson("status", {
        store: { events: freshness.eventsInLog, sessions: sessions.length },
        index: { fresh: freshness.fresh, eventsIndexed: freshness.eventsIndexed },
        capture,
      });
    } else {
      console.log(
        [
          `events    ${freshness.eventsInLog} recorded · ${sessions.length} session(s)`,
          `index     ${freshness.fresh ? "fresh" : "STALE"} (${freshness.eventsIndexed} indexed)`,
          `capture   ${capture.note}`,
        ].join("\n"),
      );
    }
    return EXIT_OK;
  } finally {
    index.close();
    await log.close();
  }
}
