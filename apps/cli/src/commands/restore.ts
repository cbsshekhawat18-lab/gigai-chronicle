/**
 * `chronicle restore <evt_id>` — one-command code time-travel (ADR-0012):
 * put the working tree back to how it was at a captured prompt. Always
 * takes a safety checkpoint first; always asks (TTY) unless --force.
 */
import path from "node:path";
import { createInterface } from "node:readline/promises";
import {
  EventEngine,
  isChronicleError,
  openWorkspace,
  restoreCheckpoint,
  restorePreview,
} from "@gigaichronicle/core";
import { isId } from "@gigaichronicle/schema";
import {
  EXIT_FAILURE,
  EXIT_NOT_A_PROJECT,
  EXIT_OK,
  EXIT_USAGE,
  findChronicleDir,
  printJson,
} from "../context.js";

export async function runRestoreCommand(
  eventId: string,
  options: { force?: boolean },
  global: { json?: boolean },
): Promise<number> {
  const chronicleDir = findChronicleDir(process.cwd());
  if (chronicleDir === null) {
    console.error("not a chronicle project (no .chronicle directory found)");
    return EXIT_NOT_A_PROJECT;
  }
  if (!isId(eventId, "event")) {
    console.error(`restore: "${eventId}" is not an event id (evt_…) — find one via chronicle replay`);
    return EXIT_USAGE;
  }
  const repoRoot = path.dirname(chronicleDir);

  try {
    const changing = await restorePreview(repoRoot, eventId);
    if (changing.length === 0) {
      console.log("nothing to restore — the working tree already matches that moment (or no checkpoint exists)");
      return EXIT_OK;
    }

    if (options.force !== true) {
      if (!process.stdin.isTTY) {
        console.error(`restore would change ${changing.length} file(s) — re-run with --force (non-interactive)`);
        return EXIT_FAILURE;
      }
      console.log(`Restoring to the moment of ${eventId} will change ${changing.length} file(s):`);
      for (const file of changing.slice(0, 20)) console.log(`  ${file}`);
      if (changing.length > 20) console.log(`  … and ${changing.length - 20} more`);
      console.log("A safety checkpoint of the CURRENT state is taken first — nothing is lost.");
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = (await rl.question("Proceed? [y/N] ")).trim().toLowerCase();
      rl.close();
      if (!answer.startsWith("y")) {
        console.log("aborted — nothing changed");
        return EXIT_OK;
      }
    }

    const result = await restoreCheckpoint(repoRoot, eventId);

    // The restore itself becomes part of the journey (ADR-0012).
    const workspace = await openWorkspace(chronicleDir);
    const engine = await EventEngine.open(chronicleDir, {
      workspaceId: workspace.workspaceId,
      provider: { id: "chronicle", version: "0" },
      fsyncIntervalMs: 0,
    });
    try {
      await engine.emit({
        type: "Ext.chronicle.WorkspaceRestored",
        actor: { kind: "human" },
        payload: {
          toEvent: eventId,
          checkpoint: result.checkpoint,
          safetyCheckpoint: result.safetyCheckpoint,
          files: result.restored.length,
        },
      });
    } finally {
      await engine.close();
    }

    if (global.json === true) {
      printJson("restore", { eventId, ...result });
    } else {
      console.log(`✓ restored ${result.restored.length} file(s) to the moment of ${eventId}`);
      if (result.untouchedNewFiles.length > 0) {
        console.log(
          `  note: ${result.untouchedNewFiles.length} file(s) created after that moment were left in place:\n` +
            result.untouchedNewFiles.map((f) => `    ${f}`).join("\n"),
        );
      }
      console.log(`  undo: chronicle restore is itself checkpointed — safety ref ${result.safetyCheckpoint.slice(0, 10)}`);
    }
    return EXIT_OK;
  } catch (error) {
    if (isChronicleError(error)) {
      console.error(error.message);
      return EXIT_FAILURE;
    }
    throw error;
  }
}
