/**
 * @gigaichronicle/provider-claude-code — the first provider, never the
 * identity (ARCHITECTURE §1). Tier-1 hooks capture + tier-2 transcript
 * backfill (CAPTURE-SURFACES §2, PROVIDERS.md row 1). Deliberately the
 * TEMPLATE every future provider copies: pure mapping modules, fingerprinted
 * fail-soft parsing, cursor state under `.local/providers/<id>/`, and the
 * emit surface as the only core import.
 */
export { PROVIDER, CAPABILITY } from "./identity.js";
export { runCapture, readResponseTail, type CaptureOutcome } from "./capture.js";
export { runBackfill, type BackfillOptions, type BackfillReport } from "./backfill.js";
export { mapHookToCandidate, CAPTURED_HOOK_EVENTS, type HookInput } from "./hooks.js";
export { parseTranscript, type ParsedTranscript } from "./transcript.js";
export { SessionMap } from "./session-map.js";
export { cwdSlug, transcriptsRoot, transcriptDirsFor } from "./transcripts-location.js";
export {
  installHooks,
  uninstallHooks,
  renderInstallPlan,
  settingsPathFor,
} from "./settings.js";

/** Canonical package name; kept in sync with package.json by test. */
export const PACKAGE_NAME = "@gigaichronicle/provider-claude-code";
