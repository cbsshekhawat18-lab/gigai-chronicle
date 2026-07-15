# What & why

<!-- Which milestone/issue does this serve? "Part of #NN" -->

## Checklist (all required — CONTRIBUTING.md)

- [ ] Tests included (every exported function; fixtures for provider changes)
- [ ] Docs updated alongside code
- [ ] Changeset added (`pnpm changeset`) or `n/a: <reason>`
- [ ] Conventional commit titles, DCO sign-off on every commit
- [ ] Performance budgets respected ([ARCHITECTURE.md §19](../docs/ARCHITECTURE.md#19-performance-strategy))
- [ ] No new runtime dependencies in `core` — or justified against the <10 policy
- [ ] No design-law violations ([ARCHITECTURE.md §2](../docs/ARCHITECTURE.md#2-design-laws)); deviations have a merged ADR
- [ ] No real secrets/user data in fixtures (SECURITY.md fixture policy)
