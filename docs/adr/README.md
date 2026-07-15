# Architecture Decision Records

Design changes to the frozen architecture go through an ADR **before** any
implementing PR ([CONTRIBUTING.md](../../CONTRIBUTING.md)). Format: MADR-lite
(Status / Context / Decision / Consequences), one file per decision,
sequential numbering, never edited after acceptance (superseding ADRs link
back).

> Dogfooding note: once Chronicle can host its own knowledge layer (Phase 2),
> these move to `.chronicle/knowledge/decisions/` — the tool records its own
> journey.

| # | Title | Status |
|---|---|---|
| [0001](0001-chronicle-dot-directory.md) | `.chronicle/` as the on-disk directory (D6) | Accepted |
| [0002](0002-chronicle-session-trailer.md) | `Chronicle-Session:` commit trailer (D7) | Accepted |
| [0003](0003-pascalcase-chronicleevents.md) | PascalCase ChronicleEvent taxonomy (D8) | Accepted |
| [0004](0004-replay-before-timeline.md) | Replay before Timeline in build order (D9) | Accepted |
| [0005](0005-mvp-surface-trim.md) | MVP surface trim (D10) | Accepted |
| [0006](0006-positioning-ai-development-history.md) | Positioning: AI Development History (D11) | Accepted |

Template:

```markdown
# NNNN — Title

- Status: Proposed | Accepted | Superseded by NNNN
- Date: YYYY-MM-DD
- Ratifies/Relates: <decision id / doc section>

## Context
## Decision
## Consequences
```
