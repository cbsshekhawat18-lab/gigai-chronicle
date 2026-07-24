/**
 * @gigaichronicle/provider-codex — the Codex CLI provider. Tier-2 rollout
 * import today (`chronicle import codex`); live hooks are a later milestone.
 * Same shape as the Claude Code provider: pure mapping modules, fingerprinted
 * fail-soft parsing, cursor state under `.local/providers/codex/`, and the
 * emit surface as the only core import.
 */
export { PROVIDER, CAPABILITY } from "./identity.js";
export { runBackfill, type BackfillOptions, type BackfillReport } from "./backfill.js";
export {
  parseRollout,
  readRolloutMeta,
  ROLLOUT_PARSER_VERSION,
  type ParsedRollout,
  type RolloutMeta,
} from "./rollout.js";
export { codexSessionsRoot, findRolloutFiles } from "./locations.js";
export { SessionMap } from "./session-map.js";

/** Canonical package name; kept in sync with package.json by test. */
export const PACKAGE_NAME = "@gigaichronicle/provider-codex";
