/**
 * Is capture actually recording? Shared by `status` and `doctor` so they can
 * never disagree. `claude-code:auto` in config is INTENT; installed hooks are
 * WIRING; neither is proof — the hooks run `chronicle`, so without the CLI on
 * PATH they record nothing (the silent dead-capture trap).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { configSchema } from "@gigaichronicle/schema";

/** Provider support truth: which providers can actually capture today. */
export const SUPPORTED_PROVIDERS = new Set<string>(["claude-code"]); // codex is import-only

export const CLI_INSTALL_COMMAND = "npm i -g gigai-chronicle";

export interface HookHealth {
  /** False when no live-capture provider is enabled — an intentionally capture-free project isn't nagged. */
  expected: boolean;
  /** Our hooks are present in a settings file (either scope). */
  installed: boolean;
  scope: "project" | "user" | null;
  /** "live" · "cli-missing" (hooks in place, `chronicle` not on PATH) · "off". */
  status: "live" | "cli-missing" | "off";
  /** Hooks installed AND the CLI they call resolves. */
  live: boolean;
  /** Where `chronicle` resolved on PATH (null when it doesn't). */
  cliPath: string | null;
  /** A one-line problem statement when capture is configured but can't record; else null. */
  problem: string | null;
}

const NOT_EXPECTED: HookHealth = {
  expected: false,
  installed: false,
  scope: null,
  status: "off",
  live: false,
  cliPath: null,
  problem: null,
};

export function readProviders(chronicleDir: string): Array<[string, string]> {
  try {
    const raw = JSON.parse(readFileSync(path.join(chronicleDir, "config.json"), "utf8"));
    const config = configSchema.safeParse(raw);
    return config.success ? Object.entries(config.data.capture.providers) : [];
  } catch {
    return [];
  }
}

export async function hookHealth(chronicleDir: string): Promise<HookHealth> {
  const expected = readProviders(chronicleDir).some(
    ([id, mode]) => id === "claude-code" && SUPPORTED_PROVIDERS.has(id) && mode !== "off",
  );
  if (!expected) return NOT_EXPECTED;
  try {
    const { captureState } = await import("@gigaichronicle/provider-claude-code");
    const state = captureState(path.dirname(chronicleDir));
    return {
      expected: true,
      installed: state.status !== "off",
      scope: state.scope,
      status: state.status,
      live: state.live,
      cliPath: state.cliPath,
      problem:
        state.status === "cli-missing"
          ? `hooks installed but \`chronicle\` not on PATH — nothing is being recorded (install: ${CLI_INSTALL_COMMAND})`
          : null,
    };
  } catch {
    return NOT_EXPECTED; // can't tell — don't claim
  }
}
