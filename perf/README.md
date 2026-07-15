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

Measurement methodology (budgets measure OUR cost, on shared CI runners):

- **Best-of-N batches** for latency budgets — package suites run in parallel
  under turbo, so a single batch's tail can absorb cross-process scheduler
  pauses; a genuine regression fails every batch (first applied in M3's
  append gate).
- **`cli.cold-start`** asserts Chronicle's delta over a bare `node -e ""`
  baseline — Windows CI runners spend ~150ms booting node.exe under
  real-time scanning before any Chronicle code runs (applied in M4).
