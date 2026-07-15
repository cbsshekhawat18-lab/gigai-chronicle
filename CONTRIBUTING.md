# Contributing to Gigai Chronicle

Thanks for helping build the open journey record. Ground rules first: the
architecture is frozen per [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) —
PRs implement it, they don't redesign it. Design changes start as an ADR
proposal in [docs/adr/](docs/adr/README.md), *before* any implementing PR.

## The rules every PR is checked against

1. **DCO, not CLA.** Sign every commit: `git commit -s`
   (`Signed-off-by: Your Name <you@example.com>`). No copyright assignment.
2. **Conventional commits.** `feat:`, `fix:`, `docs:`, `chore:`, `test:`,
   `refactor:` — scoped where useful (`feat(core): …`).
3. **Every PR carries tests.** Every exported function has tests. Provider
   PRs additionally carry recorded, sanitized fixture transcripts.
4. **Performance budgets are merge gates** ([ARCHITECTURE.md §19](docs/ARCHITECTURE.md#19-performance-strategy)).
   A red budget is a red build, not a discussion.
5. **Design laws are review criteria** ([ARCHITECTURE.md §2](docs/ARCHITECTURE.md#2-design-laws)).
   `pnpm lint` enforces the structural ones (dependency direction, pipeline
   rule); reviewers enforce the rest.
6. **A changeset per user-visible change**: `pnpm changeset`.
7. **No real secrets or real user data in fixtures, ever.** Fixtures are
   synthetic or scrubbed-and-reviewed (two-pass rule: automated secret scan +
   manual checklist). See [SECURITY.md](SECURITY.md).
8. **Zero network in tests.** The test harness denies TCP by design
   (`test-setup/deny-network.mjs`); don't work around it — code that needs
   the network outside the Phase-4 cloud is an architecture violation.

## Getting started

```bash
corepack pnpm install
corepack pnpm build && corepack pnpm test && corepack pnpm lint && corepack pnpm typecheck
```

Node >= 20.19 required (CI runs Node 22 on ubuntu/macos/windows — all three
must pass).

Look for [`good-first-issue`](https://github.com/search?q=label%3Agood-first-issue)
labels — fixture and docs contributions are genuinely valued here: recorded
fixtures are this project's compatibility contract.

## Project structure

See [ARCHITECTURE.md §12](docs/ARCHITECTURE.md#12-monorepo-layout). The short
version: `packages/schema` is the contract, `packages/core` is the engine,
`packages/providers/*` capture, `apps/*` are thin surfaces. Nothing imports
from `apps/*`; providers only emit.

## Governance

Year-1 BDFL with public RFCs (ADRs + issues), per
[PHASE-0.md §16](docs/PHASE-0.md#16-open-source-strategy). The format spec has
a stricter change process than the code.
