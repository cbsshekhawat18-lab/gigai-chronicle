/**
 * Tool detection for the init interview (§14, capture audit §9.3): which AI
 * tools already have local state on this machine. Detection means "residue
 * exists", not "capture works" — providers land in M7/Phase 2 and status
 * reports support honestly.
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/** Known provider ids → the home-relative directory whose presence marks the tool. */
const DETECTION_DIRS: ReadonlyArray<readonly [providerId: string, dir: string]> = [
  ["claude-code", ".claude"],
  ["codex", ".codex"],
  ["gemini", ".gemini"],
];

export type ProviderMode = "auto" | "on" | "off";

/** The config `capture.providers` map for a fresh init. */
export function detectProviders(home: string = homedir()): Record<string, ProviderMode> {
  const providers: Record<string, ProviderMode> = {};
  for (const [id, dir] of DETECTION_DIRS) {
    providers[id] = existsSync(path.join(home, dir)) ? "auto" : "off";
  }
  providers["cursor-db"] = "off"; // experimental, off by default (decision #2)
  return providers;
}
