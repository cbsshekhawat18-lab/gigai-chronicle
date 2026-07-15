/**
 * CLI execution context: locate the store, resolve the workspace identity.
 *
 * Exit-code contract (§14, stable forever): 0 ok · 1 operational failure ·
 * 2 usage error · 3 not a chronicle project.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { openWorkspace } from "@gigaichronicle/core";
import type { WorkspaceId } from "@gigaichronicle/schema";

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
 * Workspace identity + continuity duties for store-touching commands.
 * Delegates to core's openWorkspace (M6): WorkspaceMoved detection,
 * throttled ProjectOpened, fingerprint refresh, foreign-repo flag. Identity
 * anomalies are surfaced as warnings on stderr — never fatal (law 8).
 */
export async function resolveWorkspace(chronicleDir: string): Promise<WorkspaceId> {
  const context = await openWorkspace(chronicleDir);
  if (context.foreignRepo) {
    console.error(
      "⚠ E_FOREIGN_REPO: this .chronicle store's project id was recorded against a different " +
        "root history — histories are NOT merged silently (see `chronicle doctor`)",
    );
  }
  if (context.moved !== null) {
    console.error(`note: workspace moved (${context.moved.fromPath} → ${context.moved.toPath})`);
  }
  return context.workspaceId;
}

/** Print a result in the stable `--json` envelope (§14). */
export function printJson(command: string, payload: Record<string, unknown>): void {
  console.log(JSON.stringify({ apiVersion: 1, command, ...payload }));
}
