/**
 * Machine-local workspace state — `.chronicle/.local/machine.json` (§6).
 * One file per clone-on-machine: the `wks_` identity, the last known path
 * (WorkspaceMoved detection), the recorded repository fingerprint
 * components (foreign-repo check), and the ProjectOpened throttle marker.
 * Extends the minimal `{ workspace }` seed M4 shipped — additive, same file.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isId, newId, type WorkspaceId } from "@gigaichronicle/schema";

export interface MachineState {
  workspace: WorkspaceId;
  /** Absolute path of the workspace root (parent of `.chronicle/`). */
  lastKnownPath?: string;
  repository?: {
    roots: string[];
    remotes: string[];
    digest: string | null;
    shallow: boolean;
  };
  /** UTC day (`YYYY-MM-DD`) a ProjectOpened was last recorded (§5.3 throttle). */
  lastProjectOpenedDay?: string;
}

export function machineFilePath(chronicleDir: string): string {
  return path.join(chronicleDir, ".local", "machine.json");
}

/** Load the state, minting the workspace id on first open of this clone. */
export async function loadOrCreateMachineState(chronicleDir: string): Promise<MachineState> {
  const file = machineFilePath(chronicleDir);
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as Partial<MachineState>;
    if (isId(parsed.workspace, "workspace")) {
      return { ...parsed, workspace: parsed.workspace };
    }
  } catch {
    // First open of this clone (or unreadable state — re-mint, never crash).
  }
  const state: MachineState = { workspace: newId("workspace") };
  await saveMachineState(chronicleDir, state);
  return state;
}

export async function saveMachineState(chronicleDir: string, state: MachineState): Promise<void> {
  const file = machineFilePath(chronicleDir);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(state, null, 2) + "\n", "utf8");
}

/** UTC day string for the ProjectOpened throttle. */
export function utcDay(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
