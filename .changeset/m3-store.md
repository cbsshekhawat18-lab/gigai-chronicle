---
"@gigaichronicle/core": minor
---

M3 — Truth on Disk: Chronicle Store layer 1. `EventLog` with exactly three
log operations (`append`/`scan`/`verify`): O(1) validated appends to
single-writer JSONL streams (session / ambient / ops routing per ADR-0007),
64KB content-addressed blob spill-over, per-stream advisory locks with
stale-lock reclaim, torn-write healing recorded as `CaptureGap`, typed
`ChronicleError` codes, and the generated-file marker helpers. Proven by
property tests (order-independent convergence; crash-safety at every
truncation offset), a real SIGKILL fault-injection test, and a real
two-branch git merge fixture with zero conflicts.
