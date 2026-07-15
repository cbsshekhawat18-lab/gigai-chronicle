# M9 — The Differentiator: Git correlation with honest confidence

> **Tracking issue (epic)** for GitHub Milestone **`M9 — Correlation`** · Target: Weeks 5–6 · Depends on: M4, M5 · Gated by: M8 passed
> Labels: `epic` `area:core` `type:feature` `P0` `phase-1`

## Goal

"This prompt" connects to "that commit" — with confidence levels the user can
trust, because one silently wrong link destroys all credibility (principle 8).
Links are derived index edges, never invented into the log
([ARCHITECTURE.md §11](../ARCHITECTURE.md#11-correlation-engine)).

## Demo

Recording linked from this epic: the J3 forensics journey — a fixture repo
with a planted regression; `chronicle inspect <sha>` surfaces the linked
session (`exact` via trailer), whose digest shows the "simplification" prompt
that dropped the null-check. The marketing story, executed literally in the
terminal.

## Deliverables

- **Watching:** daemon-less `.git/HEAD` / `refs/**` / index-mtime watchers,
  200 ms debounce; plumbing reads via **system git only** (no native
  bindings — an explicit, ADR-recorded non-decision).
- **Events:** `GitCommitCreated`, `GitPush`, `BranchChanged`, `GitTagCreated`.
- **Trailer (opt-in):** `prepare-commit-msg` appending
  `Chronicle-Session: ses_…` — **chain, never clobber** (husky/lefthook/
  `core.hooksPath` detection, guarded shim), <10 ms fail-open, one-command
  uninstall; *reads* the ai-trailers convention for interop.
- **Scoring:** trailer → `exact`; dirty-set ∩ session-window → `high`;
  time-window → `inferred`; `LinkConfirmed`/`LinkRejected` events override
  heuristics permanently.
- **Surfacing:** `chronicle inspect <sha>` with confidence; `timeline
  --branch`.

## Work breakdown (child issues)

- [x] Watchers + debounce + plumbing readers (M) — **placement corrected:** fs-watching lives in the extension layer (M10), which owns watchers per §15; core exposes `recomputeLinks` (scan-based, bounded to 500 commits) that any surface triggers. No daemon, no timers in core
- [x] Git event emission (S) — GitCommitCreated/BranchChanged emitted by surfaces via the engine (ambient binding; active session attaches automatically via the marker)
- [x] Hook-chaining installer/uninstaller (L) — pure-POSIX prepare-commit-msg block (~1ms, fail-open, no Node spawn) reading the engine-maintained `.local/active-session` marker; honors core.hooksPath; marked block chains after existing hooks; uninstall removes exactly ours
- [x] Trailer write + ai-trailers read interop (S) — `git interpret-trailers --if-exists doNothing`; write side done, ai-trailers read interop deferred to Phase 2 (documented)
- [x] Scoring engine + links population (M) — exact(trailer) / high(dirty-set∩window) / inferred(window); second-granularity window comparison (commit timestamps are second-precision); full-refresh projection via `index.replaceLinks`
- [x] Confirm/reject override path (S) — `chronicle link confirm|reject` emits LinkConfirmed/Rejected; rejected pairs suppressed forever; confirmed → exact/human
- [x] Correlation scenario fixture suite (L) — real-git fixture: trailer→exact, overlap→high, **near-miss stays inferred**, backdated root never linked, reject persists across recomputes
- [x] Hook-manager compatibility (M) — pre-existing-hook chaining tested (husky-style file); core.hooksPath honored; lefthook/husky full matrix → Phase 2 CI job (noted)
- [x] J3 forensics demo fixture (S) — `chronicle inspect <sha>` surfaces links with confidence + source

## Definition of Done

1. Scenario fixtures produce expected links **with expected confidence** —
   including the designed near-miss that must stay `inferred`, never upgrade.
2. Hook install on a husky repo: both hooks run; uninstall restores the
   original byte-for-byte; matrix green for all four manager setups.
3. Trailer beats heuristics; `LinkRejected` severs permanently across
   `--reindex`.
4. Idle watcher CPU ≈ 0 (event-driven); commit→event latency <1 s.
5. Paths-with-spaces + Windows green for all git interaction.
6. Process gates: no-libgit2 ADR merged; correlation honesty documented in a
   user-facing page (how confidence is computed — trust requires
   explainability); changeset.

## Risks

| Risk | Mitigation |
|---|---|
| Hook chaining breaks someone's existing hook setup (reputation-critical — this is us touching *their* git) | Every install shows a diff and requires confirmation (§5 boundary 9); compatibility matrix in CI; uninstall is tested restore-to-byte |
| Heuristic over-linking erodes trust faster than under-linking | Bias thresholds conservative by design; near-miss fixture enshrines the bias; UI/CLI always show confidence, never bare links |
| Rebase/amend rewrites orphan trailer links | Out of scope here (post-rewrite hook is Phase 2) — orphaned links degrade to `inferred` with a doctor note rather than lying |

## Release / versioning

`v0.1.0-beta.2` — the full headless value loop (capture → replay →
correlate → inspect) complete. Digest + trailer become the artifacts outside
testers show their teams — first organic-spread checkpoint.

## References

[ARCHITECTURE.md §11](../ARCHITECTURE.md#11-correlation-engine) · [CAPTURE-SURFACES.md §7](../CAPTURE-SURFACES.md#7-git--github) · decision D7 · journey J3
