---
"@gigaichronicle/core": minor
"@gigaichronicle/cli": minor
---

M4 — Disposable Speed. Core: `ChronicleIndex` (better-sqlite3 per ADR-0008,
lazy-loaded; WAL + FTS5; incremental per-stream cursors; rebuild is the only
migration — proven row-for-row equal to incremental), query API
(`timeline/sessions/search/commitLinks`), `runDoctor` (verify+heal, index
freshness, secret audit reporting kinds-never-content, provable zero-egress
verdict), and the seed secret pattern pack M5 will extend. CLI: single-file
esbuild bundle with `doctor` / `timeline` / `status`, the stable `--json`
envelope (`apiVersion: 1`) and exit-code contract (0/1/2/3). Budgets
measured: 100k rebuild 1.7s/30s · month query 16ms/100ms · FTS 1.2ms/200ms ·
cold start 44ms/150ms.
