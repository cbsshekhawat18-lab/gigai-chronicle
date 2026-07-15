/**
 * `chronicle session promote|privatize <id>` — the social-privacy model
 * (A2, §14 consent gate 2): sessions can live off the shared record in
 * `.local/private/` and be promoted deliberately. Moving a stream file
 * invalidates its index cursor, so the index is rebuilt afterward.
 */
import { existsSync, mkdirSync, renameSync } from "node:fs";
import path from "node:path";
import { ChronicleIndex, EventLog, openWorkspace, sessionStreamRef } from "@gigaichronicle/core";
import { isId, type SessionId } from "@gigaichronicle/schema";
import {
  EXIT_FAILURE,
  EXIT_NOT_A_PROJECT,
  EXIT_OK,
  findChronicleDir,
  printJson,
} from "../context.js";

export async function runSessionCommand(
  action: string,
  target: string,
  global: { json?: boolean },
): Promise<number> {
  const chronicleDir = findChronicleDir(process.cwd());
  if (chronicleDir === null) {
    console.error("not a chronicle project (no .chronicle directory found)");
    return EXIT_NOT_A_PROJECT;
  }
  if (action !== "promote" && action !== "privatize") {
    console.error(`session: unknown action "${action}" (promote|privatize)`);
    return EXIT_FAILURE;
  }
  if (!isId(target, "session")) {
    console.error(`session: "${target}" is not a session id (ses_…)`);
    return EXIT_FAILURE;
  }

  const ref = sessionStreamRef(target as SessionId);
  const sharedFile = path.join(chronicleDir, ...ref.relativeFile.split("/"));
  const privateFile = path.join(chronicleDir, ".local", "private", ...ref.relativeFile.split("/"));
  const digestFile = sharedFile.replace(/\.jsonl$/, ".md");

  const [from, to] =
    action === "privatize" ? [sharedFile, privateFile] : [privateFile, sharedFile];
  if (!existsSync(from)) {
    console.error(
      existsSync(to)
        ? `session: ${target} is already ${action === "privatize" ? "private" : "shared"}`
        : `session: no stream file found for ${target}`,
    );
    return EXIT_FAILURE;
  }

  mkdirSync(path.dirname(to), { recursive: true });
  renameSync(from, to);
  if (action === "privatize" && existsSync(digestFile)) {
    // The digest quotes session content — it must never outlive the promotion state.
    renameSync(digestFile, path.join(path.dirname(privateFile), path.basename(digestFile)));
  }
  if (action === "promote") {
    const privateDigest = path.join(path.dirname(privateFile), path.basename(digestFile));
    if (existsSync(privateDigest)) renameSync(privateDigest, digestFile);
  }

  // Stream files moved → cursors are stale by construction: rebuild.
  const workspace = await openWorkspace(chronicleDir);
  const log = await EventLog.open(chronicleDir, {
    workspaceId: workspace.workspaceId,
    fsyncIntervalMs: 0,
  });
  const index = ChronicleIndex.open(chronicleDir);
  try {
    await index.rebuild(log);
  } finally {
    index.close();
    await log.close();
  }

  if (global.json === true) {
    printJson("session", { action, session: target, movedTo: path.relative(chronicleDir, to) });
  } else {
    console.log(
      action === "privatize"
        ? `✓ ${target} moved to .local/private/ — off the shared record until you promote it`
        : `✓ ${target} promoted to the shared record — it will travel with the repo`,
    );
  }
  return EXIT_OK;
}
