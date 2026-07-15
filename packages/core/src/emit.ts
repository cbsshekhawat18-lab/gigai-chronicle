/**
 * The provider emit surface — the ONLY module of @gigaichronicle/core that
 * provider packages may import (`@gigaichronicle/core/emit`, enforced by the
 * repository boundary lint — ARCHITECTURE.md §3, design law 4).
 *
 * Deliberately narrow: providers can open an engine, emit candidates, and
 * report tier degradation. No store, no index, no queries, no replay — a
 * provider that needs more is a provider trying to skip the pipeline.
 */
export {
  EventEngine,
  MAX_CANDIDATE_BYTES,
  type RawCandidate,
  type EmitResult,
  type ProviderIdentity,
  type EventEngineOptions,
} from "./engine/event-engine.js";
export { fixedGitReader, type GitReader } from "./git/git-reader.js";
