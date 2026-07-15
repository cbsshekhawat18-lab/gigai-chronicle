# 0006 — Positioning: AI Development History (replay as hero)

- Status: Accepted
- Date: 2026-07-15 (decision 2026-07-14)
- Ratifies: decision **D11** ([PHASE-0.md §3](../PHASE-0.md#3-product-positioning))

## Context

Three candidate positions were compared (History / Replay / Intelligence).
Engineering is bound by positioning because copy appears in code: CLI help
text, extension listing, READMEs, error messages.

## Decision

Category: **AI Development History**. Hero capability: **Replay**.
"AI Development Intelligence" is deferred until knowledge/benchmark layers
make it true. **Banned vocabulary in all user-facing text:** Prompt Manager,
Prompt Versioning, PromptOps, and any single-vendor promise ("never lose
another Claude Code session"). The canonical promise is exactly:
*"Build software with AI. Never lose the journey."*

## Consequences

- The M10 marketplace listing and all `--help` copy are reviewed against the
  banned list ([HOMEPAGE.md](../HOMEPAGE.md) carries the copy rules).
- Provider names appear in "works with" contexts only, never in the promise.
