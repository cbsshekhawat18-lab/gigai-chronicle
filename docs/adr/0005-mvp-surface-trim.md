# 0005 — MVP surface trim

- Status: Accepted
- Date: 2026-07-15 (decision 2026-07-14)
- Ratifies: decision **D10** ([ARCHITECTURE.md §24](../ARCHITECTURE.md#24-decision-log-resolved--newly-open)); full rationale in [ARCHITECTURE-REVIEW.md](../ARCHITECTURE-REVIEW.md)

## Context

The final pre-implementation review challenged every MVP feature against the
GitLens test (small, focused, developer-first, extensible, trustworthy).

## Decision

Removed from MVP (deferred, not deleted): prompt library (→ P2), the four
empty sidebar trees (→ their phases; MVP ships **one tree + one webview**),
monthly digests + `timeline/` dir (→ P2), `chronicle analyze` (→ P2),
`chronicle wrap` (→ P2), `chronicle gc`/retention (→ P2), plugin capability
kinds beyond `capture`+`backfill` (→ their phases), `sync`/`plugins` config
keys (reserved, absent on disk), configurable spill threshold (fixed 64KB).

## Consequences

- The MVP is: Event Engine + Store + Replay + correlation + redaction +
  doctor; one provider; 10 CLI commands; Sessions tree + Timeline webview.
- Every deferred item already has a specced home; re-adding one to the MVP
  requires a superseding ADR, not a PR.
