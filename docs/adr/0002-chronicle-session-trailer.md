# 0002 — `Chronicle-Session:` commit trailer

- Status: Accepted
- Date: 2026-07-15 (decision 2026-07-14)
- Ratifies: decision **D7** ([ARCHITECTURE.md §24](../ARCHITECTURE.md#24-decision-log-resolved--newly-open))

## Context

The opt-in `prepare-commit-msg` trailer is the strongest correlation signal
(`exact` links). A9 originally named it `Gigai-Session:`. Trailers live in
users' commit messages forever and render on every git host — they are
**spec surface, not brand surface**.

## Decision

The trailer is **`Chronicle-Session: <ses_ulid>`**. Chronicle also *reads*
the ai-trailers convention for interop (never writes it).

## Consequences

- Trailer format becomes part of Chronicle Spec v1; third-party writers must
  reproduce it exactly.
- Remains the **single** exception to read-git-never-write (design law 9),
  individually opt-in, chained-not-clobbered (M9).
