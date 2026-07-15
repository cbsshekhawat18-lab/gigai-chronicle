---
"@gigaichronicle/schema": patch
"@gigaichronicle/core": patch
"@gigaichronicle/plugin-kit": patch
"@gigaichronicle/ui": patch
"@gigaichronicle/provider-claude-code": patch
"@gigaichronicle/cli": patch
"gigaichronicle-vscode": patch
---

M1 — Foundations: monorepo scaffold (pnpm + Turborepo + TypeScript ESM),
3-OS CI with network-denial test harness, architecture boundary lint
(dependency direction + provider pipeline rule), governance (MIT, DCO,
conventional commits), ADR-0001…0006 ratifying decisions D6–D11, performance
budgets as data, path-edge fixtures. No runtime behavior yet — packages
export identity only until their owning milestones land.
