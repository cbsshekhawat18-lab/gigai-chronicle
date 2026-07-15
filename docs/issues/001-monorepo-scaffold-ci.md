# M1 — Foundations: monorepo, CI, and project governance

> **Tracking issue (epic)** for GitHub Milestone **`M1 — Foundations`** · Target: Week 1 · Depends on: sign-off of D6–D11 ([ARCHITECTURE.md §24](../ARCHITECTURE.md#24-decision-log-resolved--newly-open))
> Labels: `epic` `area:infra` `type:chore` `P0` `phase-1`

## Goal

A contributor can clone the repo, run `pnpm build && pnpm test && pnpm lint`
green on any OS, and the CI + lint rules make the architecture's structural
laws impossible to violate by accident — before a single line of product code
exists.

## Demo (what "done" looks like)

The README shows a 3-OS CI badge matrix, and a deliberately wrong PR (a
provider importing the store) is posted and **rejected by CI**, linked from
this epic as proof.

## Deliverables

- **Code:** pnpm workspaces + Turborepo; TS/ESM base config; Changesets;
  empty-but-building package skeletons (`schema`, `core`,
  `providers/claude-code`, `plugin-kit`, `ui`, `apps/cli`, `apps/vscode`).
- **CI:** ubuntu/macos/windows × Node LTS; **network-denial harness** (design
  law 7 testable from commit one); paths-with-spaces + unicode + long-Windows-path
  fixture repos; perf-budget harness stub wired to [§19](../ARCHITECTURE.md#19-performance-strategy).
- **Lint as law:** dependency direction (`schema ← core ← providers ← apps`)
  and the pipeline rule (`providers/*` import the emit surface only) as
  CI-failing rules.
- **Governance (real-OSS floor):** `LICENSE` (MIT), `CONTRIBUTING.md` (DCO
  not CLA, conventional commits, every-PR-carries-tests, perf budgets are
  merge gates, ADR-before-design-change — per [PHASE-0.md §16](../PHASE-0.md#16-open-source-strategy)),
  `CODE_OF_CONDUCT.md`, `SECURITY.md` (private disclosure path), issue/PR
  templates, `CODEOWNERS` (single maintainer for now — honest BDFL).
- **ADR seed:** `docs/adr/` (dogfooding target: moves into
  `.chronicle/knowledge/decisions/` once chronicle can host it) with
  ADR-0001…0006 ratifying D6–D11 (dir rename, trailer, PascalCase events,
  replay-first, MVP trim, positioning).

## Work breakdown (child issues to spin out)

- [x] Bootstrap workspaces/turbo/tsconfig/changesets (M) — 2026-07-15
- [x] Package skeletons + build graph (S) — 7 packages, `pnpm build` 7/7
- [x] Dependency-direction + pipeline-rule lint (M) — `scripts/check-boundaries.mjs` + 8 node:test cases (incl. clean-tree check of this repo)
- [x] CI matrix workflows + caching (M) — `.github/workflows/ci.yml`; **matrix proof pending first push to GitHub**
- [x] Network-denial test harness (M) — `test-setup/deny-network.mjs`, verified by `packages/core/test/network-denial.test.ts`
- [x] Path-edge fixture repos (S) — spaces + unicode committed; long-path generated at test time (see fixtures README)
- [x] Governance file set + templates (S) — LICENSE, CONTRIBUTING (DCO), CoC, SECURITY, issue/PR templates, CODEOWNERS
- [x] ADR-0001…0006 recording D6–D11 (S) — `docs/adr/`

**Status 2026-07-15 — ✅ MILESTONE CLOSED.** Implemented and validated:
build 7/7, typecheck 11/11, lint clean, package tests green, script tests
8/8. Remote proofs delivered on
[cbsshekhawat18-lab/gigai-chronicle](https://github.com/cbsshekhawat18-lab/gigai-chronicle):
DoD #1 — 3-OS CI matrix green ([run 29413360469](https://github.com/cbsshekhawat18-lab/gigai-chronicle/actions/runs/29413360469));
DoD #2 — forbidden-import demo [PR #1](https://github.com/cbsshekhawat18-lab/gigai-chronicle/pull/1)
rejected by CI on the matrix and closed unmerged.

## Definition of Done (exit criteria)

1. `pnpm build && pnpm test && pnpm lint` green on all three OSes.
2. The forbidden-import demo PR fails CI; a test making a network call fails CI.
3. Changesets produces a valid (unpublished) release plan.
4. `CONTRIBUTING.md` is complete enough that an outside dev can land a
   fixture PR without asking process questions.
5. All D6–D11 exist as merged ADRs.
6. Process gates met: conventional commits throughout; changeset present;
   README quickstart updated.

## Risks

| Risk | Mitigation |
|---|---|
| Windows CI flakiness eats week 1 | Path-edge fixtures land *first*; Windows job required-not-optional from day one so pain surfaces immediately |
| Governance bikeshedding | Copy the decided positions from PHASE-0 §16 verbatim; no new decisions in this milestone |

## Release / versioning

No release. Tags/changesets infrastructure proven with a `v0.0.1`
internal-only dry-run plan.

## References

[ARCHITECTURE.md §12](../ARCHITECTURE.md#12-monorepo-layout) · [§2 (laws 4, 7, 10)](../ARCHITECTURE.md#2-design-laws) · [PHASE-0.md §16](../PHASE-0.md#16-open-source-strategy)
