/**
 * `chronicle link confirm|reject <sha> <session>` — the human override
 * (§11): recorded as events (the journey remembers the judgment), then
 * links recompute so heuristics are overridden permanently.
 */
import path from "node:path";
import {
  ChronicleIndex,
  EventEngine,
  EventLog,
  openWorkspace,
  recomputeLinks,
} from "@gigaichronicle/core";
import { GIT_SHA_REGEX, isId } from "@gigaichronicle/schema";
import {
  EXIT_FAILURE,
  EXIT_NOT_A_PROJECT,
  EXIT_OK,
  findChronicleDir,
  printJson,
} from "../context.js";

export async function runLinkCommand(
  action: string,
  sha: string,
  session: string,
  global: { json?: boolean },
): Promise<number> {
  const chronicleDir = findChronicleDir(process.cwd());
  if (chronicleDir === null) {
    console.error("not a chronicle project (no .chronicle directory found)");
    return EXIT_NOT_A_PROJECT;
  }
  if (action !== "confirm" && action !== "reject") {
    console.error(`link: unknown action "${action}" (confirm|reject)`);
    return EXIT_FAILURE;
  }
  if (!GIT_SHA_REGEX.test(sha) || !isId(session, "session")) {
    console.error("link: usage — chronicle link confirm|reject <sha> <ses_…>");
    return EXIT_FAILURE;
  }

  const workspace = await openWorkspace(chronicleDir);
  const engine = await EventEngine.open(chronicleDir, {
    workspaceId: workspace.workspaceId,
    provider: { id: "chronicle", version: "0" },
    fsyncIntervalMs: 0,
  });
  try {
    const result = await engine.emit({
      type: action === "confirm" ? "LinkConfirmed" : "LinkRejected",
      actor: { kind: "human" },
      payload: { commit: sha.slice(0, 7), session },
    });
    if (!result.accepted) {
      console.error(`link: not recorded — ${(result as { reason: string }).reason}`);
      return EXIT_FAILURE;
    }
  } finally {
    await engine.close();
  }

  // Human judgment recorded — refresh the derived projection.
  const log = await EventLog.open(chronicleDir, {
    workspaceId: workspace.workspaceId,
    fsyncIntervalMs: 0,
  });
  const index = ChronicleIndex.open(chronicleDir);
  try {
    await index.catchUp(log);
    await recomputeLinks(path.dirname(chronicleDir), log, index);
  } finally {
    index.close();
    await log.close();
  }

  if (global.json === true) printJson("link", { action, commit: sha.slice(0, 7), session });
  else {
    console.log(
      action === "confirm"
        ? `✓ ${sha.slice(0, 7)} ↔ ${session} confirmed (exact, human) — heuristics overridden`
        : `✓ ${sha.slice(0, 7)} ↔ ${session} severed — this pair will never be re-linked by heuristics`,
    );
  }
  return EXIT_OK;
}
