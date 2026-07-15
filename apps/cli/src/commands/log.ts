/**
 * `chronicle log "<text>"` — tier-4 manual capture (§4): the universal
 * floor, honest about its fidelity (provider "manual" ⇒ lossy replay).
 * Notes land in one manual session per UTC day per workspace.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { EventEngine, openWorkspace, utcDay } from "@gigaichronicle/core";
import { isId, newId, type SessionId } from "@gigaichronicle/schema";
import { EXIT_NOT_A_PROJECT, EXIT_OK, findChronicleDir, printJson } from "../context.js";

interface ManualState {
  day: string;
  session: SessionId;
}

function manualSessionFor(chronicleDir: string): { session: SessionId; isNew: boolean } {
  const file = path.join(chronicleDir, ".local", "providers", "manual", "current.json");
  const today = utcDay();
  try {
    const state = JSON.parse(readFileSync(file, "utf8")) as ManualState;
    if (state.day === today && isId(state.session, "session")) {
      return { session: state.session, isNew: false };
    }
  } catch {
    // first note of the day
  }
  const session = newId("session");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ day: today, session } satisfies ManualState) + "\n");
  return { session, isNew: true };
}

export async function runLogCommand(
  message: string,
  global: { json?: boolean },
): Promise<number> {
  const chronicleDir = findChronicleDir(process.cwd());
  if (chronicleDir === null) {
    console.error("not a chronicle project (no .chronicle directory found)");
    return EXIT_NOT_A_PROJECT;
  }
  const workspace = await openWorkspace(chronicleDir);
  const engine = await EventEngine.open(chronicleDir, {
    workspaceId: workspace.workspaceId,
    provider: { id: "manual", version: "0" },
    fsyncIntervalMs: 0,
  });
  try {
    const { session, isNew } = manualSessionFor(chronicleDir);
    if (isNew) {
      await engine.emit({
        type: "SessionStarted",
        session,
        actor: { kind: "human" },
        payload: { title: `Manual notes ${utcDay()}`, resumedFrom: null },
      });
    }
    const result = await engine.emit({
      type: "PromptSubmitted",
      session,
      actor: { kind: "human" },
      payload: { text: message },
    });
    if (global.json === true) {
      printJson("log", { session, accepted: result.accepted });
    } else {
      console.log(result.accepted ? `✓ noted in ${session}` : `✗ not recorded: ${(result as { reason: string }).reason}`);
    }
    return EXIT_OK;
  } finally {
    await engine.close();
  }
}
