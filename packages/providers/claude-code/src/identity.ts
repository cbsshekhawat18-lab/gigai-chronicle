/** Provider identity + the machine-readable capability declaration (§16). */
import type { ProviderIdentity } from "@gigaichronicle/core/emit";

export const PROVIDER: ProviderIdentity = { id: "claude-code", version: "0.1.0" };

/**
 * Must match this provider's row in docs/PROVIDERS.md — conformance-checked
 * by test. Fidelity claims are demonstrated on fixtures, not asserted.
 */
export const CAPABILITY = {
  captureTier: 1,
  replayFidelity: "full",
  maintenanceRisk: "low",
  prompts: true,
  toolCalls: true,
  files: true,
  gitCorrelation: true,
} as const;
