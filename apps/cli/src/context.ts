/**
 * CLI execution context: locate the store, resolve the workspace identity.
 *
 * Exit-code contract (§14, stable forever): 0 ok · 1 operational failure ·
 * 2 usage error · 3 not a chronicle project.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isId, newId, type WorkspaceId } from "@gigaichronicle/schema";

export const EXIT_OK = 0;
export const EXIT_FAILURE = 1;
export const EXIT_USAGE = 2;
export const EXIT_NOT_A_PROJECT = 3;

/** Walk up from `startDir` to the nearest `.chronicle/` directory. */
export function findChronicleDir(startDir: string): string | null {
  let current = path.resolve(startDir);
  for (;;) {
    const candidate = path.join(current, ".chronicle");
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * Workspace identity for store-authored events. M6 owns the full identity
 * model; until then this seeds `.local/machine.json` with the `wks_` id that
 * M6 will extend (same file, same key — additive).
 */
export function resolveWorkspaceId(chronicleDir: string): WorkspaceId {
  const machineFile = path.join(chronicleDir, ".local", "machine.json");
  try {
    const machine = JSON.parse(readFileSync(machineFile, "utf8")) as { workspace?: unknown };
    if (isId(machine.workspace, "workspace")) return machine.workspace;
  } catch {
    // Missing or unreadable — create below.
  }
  const workspace = newId("workspace");
  mkdirSync(path.dirname(machineFile), { recursive: true });
  writeFileSync(machineFile, JSON.stringify({ workspace }, null, 2) + "\n");
  return workspace;
}

/** Print a result in the stable `--json` envelope (§14). */
export function printJson(command: string, payload: Record<string, unknown>): void {
  console.log(JSON.stringify({ apiVersion: 1, command, ...payload }));
}
