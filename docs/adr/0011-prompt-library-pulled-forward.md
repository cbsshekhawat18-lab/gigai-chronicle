# 0011 — Prompt library pulled forward into v0.1 (founder decision)

- Status: Accepted
- Date: 2026-07-17
- Supersedes: the prompt-library deferral in [ADR-0005](0005-mvp-surface-trim.md)
- Relates: [ARCHITECTURE.md §5.4](../ARCHITECTURE.md#5-the-chronicleevent-model) (the design is unchanged — only the schedule moves)

## Context

ADR-0005 trimmed the prompt library to Phase 2 ("history search covers 70%
of P1"). Post-MVP founder testing concluded prompt version control is wanted
now. Per ADR-0005's own rule, re-adding requires a superseding ADR.

## Decision

Implement the §5.4 design as specced, CLI-first:

- **Storage:** `.chronicle/prompts/<slug>/prompt.md` (current version,
  YAML-frontmatter: `id prm_…, slug, title, tags, version, created`,
  optional `sourceSession`) + immutable `versions/v<N>.md`. Curated files:
  humans may edit `prompt.md` freely; `chronicle prompt save` snapshots the
  next version. Committed → synced by git like everything else.
- **Versioning:** append-only versions; `save` on an existing slug bumps
  `version` and writes the new immutable file. Prompt diff is a **plain
  text diff** — no special machinery (§5.4).
- **CLI:** `chronicle prompt save|list|show|versions|diff`.
- **Frontmatter:** minimal key/value subset parsed in-core — no YAML
  dependency (core <10 runtime deps policy holds).

**Still deferred to Phase 2:** the extension Prompts tree (one-list rule
stands), save-from-selection UI, and a `PromptVersionCreated` core event
type (additive spec bump, lands with the Phase-2 knowledge batch — until
then prompt files are curated artifacts synced by git, which is already
their canonical transport).

## Consequences

- P1 pain ("that prompt worked — where is it now?") is served in v0.1.
- The event-taxonomy freeze is respected: no new core types slip in ahead
  of their spec revision.
