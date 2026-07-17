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
| [0007](0007-store-stream-layout.md) | Store stream layout: ambient streams, ops streams, spill scope | Accepted |
| [0008](0008-sqlite-driver.md) | SQLite driver: better-sqlite3 (node:sqlite as planned successor) | Accepted |
| [0009](0009-repository-fingerprint.md) | Repository fingerprint algorithm & remote-URL normalization | Accepted |
| [0010](0010-replay-frame-model.md) | ReplayFrame model & determinism rules | Accepted |
| [0011](0011-prompt-library-pulled-forward.md) | Prompt library pulled forward into v0.1 | Accepted |
| [0012](0012-git-native-code-checkpoints.md) | Git-native code checkpoints & explicit restore | Accepted |
| [0013](0013-intent-attribution-pulled-forward.md) | Intent attribution (`chronicle why`) pulled forward into v0.1 | Accepted |
| [0014](0014-prompt-seam-promote-captured.md) | The prompt seam: promote a captured prompt into the library | Accepted |
| [0015](0015-metadata-mode-enforced-in-the-engine.md) | High-sensitivity capture mode enforced in the engine (privacy fix) | Accepted |

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
