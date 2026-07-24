/** Provider identity + the machine-readable capability declaration (§16). */
import type { ProviderIdentity } from "@gigaichronicle/core/emit";

export const PROVIDER: ProviderIdentity = { id: "codex", version: "0.1.0" };

/**
 * Reflects what this provider ACTUALLY does today: tier-2 rollout import of
 * the conversation and tool calls. Files and git correlation await live hooks
 * (PROVIDERS.md marks them as the Codex ceiling, not the shipped floor). A
 * capability is claimed only once demonstrated on fixtures — never asserted
 * ahead of the code.
 */
export const CAPABILITY = {
  captureTier: 2,
  replayFidelity: "partial",
  maintenanceRisk: "medium",
  prompts: true,
  toolCalls: true,
  files: false,
  gitCorrelation: false,
} as const;
