# M3 — Truth on Disk: Chronicle Store layer 1 (append-only EventLog)

> **Tracking issue (epic)** for GitHub Milestone **`M3 — Store/Log`** · Target: Weeks 1–2 · Depends on: M2
> Labels: `epic` `area:core` `type:feature` `P0` `phase-1`

## Goal

The truth layer exists with exactly three operations — `append` / `scan` /
`verify` — and its two load-bearing promises are *proven*, not asserted:
crash-safety (torn writes truncate, never corrupt) and structural
conflict-freedom (two branches/machines merge with zero conflicts).

## Demo

A recorded test run: `kill -9` mid-append, then `verify()` heals the log and
a `CaptureGap` documents the loss; followed by the two-branch merge fixture
merging clean. Both linked from this epic.

## Deliverables

- **Code:** `EventLog` (append O(1), line-buffered, fsync policy; scan by
  range; verify+truncate); layout per [§7.2](../ARCHITECTURE.md#7-on-disk-format-the-chronicle-spec)
  (`sessions/YYYY/MM/ses_<ulid>.jsonl`, single-writer); visibility routing
  (`shared`→`sessions/`, `local`→`.local/ops/`); blob spill >64KB (fixed
  constant); per-session advisory locks; generated-file marker helper.
- **Tests:** fast-check property suites (order-independent convergence;
  crash-safety under fault injection); the R7 two-branch merge fixture;
  cross-platform file semantics (Windows locking, case-insensitive FS).
- **Docs:** on-disk format notes folded into the Spec v1 draft (M2 README).

## Work breakdown (child issues)

- [x] `append` + handle/fsync lifecycle (M) — cached handles, unref'd fsync timer, flush/close
- [x] `scan(range)` + month-shard iteration (M) — visibility/session/ts filters; torn tails tolerated
- [x] `verify()` torn-line truncation + `CaptureGap` emission (M) — idempotent; non-tail corruption reported, never rewritten
- [x] Visibility routing + `.local/ops/` streams (S) — plus **ambient per-workspace streams** for sessionless shared events (**ADR-0007**, settled before implementing)
- [x] Blob spill-over, content-addressed sidecars (M) — hash-verified `readBlob`; keep-inline-if-invalid fallback
- [x] Advisory locks (`.local/locks/`) (M) — `E_LOCKED` for live holders, stale-pid reclaim
- [x] Property test: order-independent convergence (M) — byte-identical trees across interleavings
- [x] Fault-injection harness (M) — truncation-at-every-offset property **plus a real SIGKILL child-process test**
- [x] Two-branch merge fixture (S) — real `git merge`, zero conflicts, post-merge verify clean
- [x] Torn-line fixture corpus (S) — covered by the truncation property + explicit torn/corrupt cases in verify tests

**Status 2026-07-15:** implemented and validated — 26 tests in 10 suites;
append p99 measured ~3.8ms (< 5ms budget, asserted from perf/budgets.json);
DoD #5 (exactly three ops) is itself a test.

## Definition of Done

1. Both property suites green on 3 OSes (fault injection included in CI).
2. Merge fixture: zero conflicts, and post-merge `verify()` clean.
3. Append hot path < 5 ms p99 on the CI perf harness (no-fsync path).
4. Every stored file validates against `packages/schema`; `cat`+`jq` readable.
5. API surface is exactly three ops — anything more is rejected in review
   (the constraint is written into the module doc).
6. Process gates: changeset; no new runtime deps (core <10 policy);
   spec-draft docs updated.

## Risks

| Risk | Mitigation |
|---|---|
| fsync/rename semantics differ across OS/filesystems | Fault-injection harness runs in the CI matrix, not just locally; known-quirk notes kept in module docs |
| Windows file locking vs. concurrent CLI+extension | Advisory-lock design tested with a two-process e2e in CI |
| Blob sidecars complicate `verify()` | Sidecars are content-addressed and immutable; verify only checks referential existence |

## Release / versioning

`@gigaichronicle/core@0.1.0-alpha` starts here (internal); log format
declared **Spec v1 draft** — breaking it after M8 requires an ADR + corpus
update.

## References

[ARCHITECTURE.md §8](../ARCHITECTURE.md#8-chronicle-store-storage-engine) · [§7](../ARCHITECTURE.md#7-on-disk-format-the-chronicle-spec) · design laws 1, 2, 6
