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

- [ ] Watchers + debounce + plumbing readers (M)
- [ ] Git event emission (S)
- [ ] Hook-chaining installer/uninstaller (L — the etiquette matrix is the hard part)
- [ ] Trailer write + ai-trailers read interop (S)
- [ ] Scoring engine + `links` population (M)
- [ ] Confirm/reject override path (S)
- [ ] Correlation scenario fixture suite incl. designed near-miss (L)
- [ ] Hook-manager compatibility matrix tests: husky, lefthook, plain hooks, `core.hooksPath` (M)
- [ ] J3 forensics demo fixture (S) `good-first-issue`

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
