# Performance budgets

[`budgets.json`](budgets.json) encodes the budgets from
[ARCHITECTURE.md §19](../docs/ARCHITECTURE.md#19-performance-strategy) as
machine-readable data. **Status: data landed in M1; the runner lands in M4**
together with the 100k-event fixture generator it needs (this sequencing is
sanctioned by the M1 epic — the budgets exist so every milestone from M3
onward writes its perf assertions against a single source of truth instead of
inlining numbers).

Rules:

- A budget regression is a red build, not a discussion (CONTRIBUTING.md).
- Budgets change only via ADR — they are part of the spec, not tuning knobs.
- Each `owner` milestone wires its own budgets into CI when it lands.
