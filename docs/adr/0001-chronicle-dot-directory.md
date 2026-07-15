# 0001 — `.chronicle/` as the on-disk directory

- Status: Accepted
- Date: 2026-07-15 (decision taken 2026-07-14; ratified with founder's
  "architecture is frozen" sign-off, 2026-07-15)
- Ratifies: decision **D6** ([ARCHITECTURE.md §24](../ARCHITECTURE.md#24-decision-log-resolved--newly-open))

## Context

v1 chose `.gigaichronicle/` (15 chars, vendor-branded). The v2 revision
re-opened the naming against `.gigai` and `.chronicle` on developer
experience, typing effort, ecosystem, open-standard potential, and 10-year
maintainability ([ARCHITECTURE.md §7.1](../ARCHITECTURE.md#7-on-disk-format-the-chronicle-spec)).

## Decision

The on-disk directory is **`.chronicle/`**. The open spec is named
**Chronicle**; **Gigai Chronicle** is the flagship implementation (the
OpenTelemetry pattern). Brand namespaces are unchanged (`@gigaichronicle`
npm scope, `gigaichronicle-plugin-*`, binary `chronicle`).

## Consequences

- Third parties can adopt the format without advertising a vendor —
  a precondition for [SPEC-ROADMAP.md](../SPEC-ROADMAP.md).
- Extension activation key: `workspaceContains:.chronicle/config.json`.
- Pre-release action: `.chronicle`/`chronicle` collision sweep; neutral
  schema host (`schemas.chronicle.dev` target).
- Superseded text in PHASE-0 A9 is annotated in place, not rewritten.
