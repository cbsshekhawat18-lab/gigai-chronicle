# @gigaichronicle/cli

## 0.1.0

### Minor Changes

- 3b31b1b: M4 — Disposable Speed. Core: `ChronicleIndex` (better-sqlite3 per ADR-0008,
  lazy-loaded; WAL + FTS5; incremental per-stream cursors; rebuild is the only
  migration — proven row-for-row equal to incremental), query API
  (`timeline/sessions/search/commitLinks`), `runDoctor` (verify+heal, index
  freshness, secret audit reporting kinds-never-content, provable zero-egress
  verdict), and the seed secret pattern pack M5 will extend. CLI: single-file
  esbuild bundle with `doctor` / `timeline` / `status`, the stable `--json`
  envelope (`apiVersion: 1`) and exit-code contract (0/1/2/3). Budgets
  measured: 100k rebuild 1.7s/30s · month query 16ms/100ms · FTS 1.2ms/200ms ·
  cold start 44ms/150ms.
- 2586087: M6 — Who Am I. Core: the three-identity model — `runInit` (mint `prj_`,
  scaffold, append-never-clobber `.gitattributes`, record `ProjectCreated`),
  repository fingerprint per ADR-0009 (normalized remotes ∥ root commits,
  pinned conformance digest, shallow-aware; foreign-repo check compares roots
  so fork remotes never false-alarm), `openWorkspace` front door
  (`WorkspaceMoved` detection, ≤1/day `ProjectOpened` throttle, foreign flag),
  and a store hardening found by fuzzing: `EventLog.append` validates the
  serialized line, closing a JSON round-trip asymmetry. CLI: `chronicle init`
  (≤3-question interview, `--yes`, TTY-aware) and identity-aware `status`.
  Schema: additive optional `capture.mode` ("full" | "metadata") storing the
  init-time high-sensitivity choice (resolved decision #3).
- b2b2879: M7 — First Provider: Claude Code. Tier-1 live capture (five hooks mapped
  through the Event Engine; fire-and-forget: `chronicle capture` exits 0
  always) + tier-2 transcript backfill (`chronicle import claude-code`,
  idempotent per-file cursors, format-fingerprinted with drift watermarks —
  skipped-and-degraded, never half-imported), session UUID→`ses_` mapping,
  Stop-hook response enrichment from the transcript tail, settings merge with
  etiquette (`chronicle hooks install|uninstall`, plan shown, never clobbers,
  removes exactly ours). Core adds `openProviderEngine` to the emit surface.
  Synthetic fixture corpus incl. the format-drift CI canary; provider guide
  draft (docs/providers/writing-a-provider.md).
- d6250b5: M8 — The Capability: Replay. Pure deterministic Replay Engine (ADR-0010:
  left-fold reduction table, gap honesty flips fidelity full→partial and never
  un-happens, manual/wrap providers cap at lossy), golden-frame Spec v3
  conformance seeds, session digests as final-frame renderings (idempotent,
  regenerated after import). CLI: `chronicle replay` (the hero), `inspect`,
  `log` (per-day lossy manual sessions), `session promote|privatize` (moves
  stream+digest, rebuilds index). Dogfood-verified on real history: 523 events
  of the session that built the product replayed end-to-end; redaction held
  (324 markers, 0 raw secrets). Provider: live-transcript fingerprint extended
  with 6 real auxiliary line types + parser-version reset semantics
  (dogfood-found drift bug).
- dcd33b3: M9 — Correlation. Link scoring as a derived projection (trailer→exact,
  dirty-set∩window→high, window→inferred; second-granularity windows because
  commit timestamps are second-precision), human overrides via
  `chronicle link confirm|reject` (rejections suppressed forever), the
  opt-in Chronicle-Session trailer as a pure-POSIX chained prepare-commit-msg
  hook (~1ms fail-open, reads the engine-maintained active-session marker,
  honors core.hooksPath, uninstall removes exactly ours), and
  `chronicle hooks install|uninstall git`. inspect <sha> now shows links
  with confidence + source.

### Patch Changes

- d225160: M1 — Foundations: monorepo scaffold (pnpm + Turborepo + TypeScript ESM),
  3-OS CI with network-denial test harness, architecture boundary lint
  (dependency direction + provider pipeline rule), governance (MIT, DCO,
  conventional commits), ADR-0001…0006 ratifying decisions D6–D11, performance
  budgets as data, path-edge fixtures. No runtime behavior yet — packages
  export identity only until their owning milestones land.
- Updated dependencies [d225160]
- Updated dependencies [1af3e9d]
- Updated dependencies [5536b71]
- Updated dependencies [3b31b1b]
- Updated dependencies [2fa51ae]
- Updated dependencies [2586087]
- Updated dependencies [b2b2879]
- Updated dependencies [d6250b5]
- Updated dependencies [dcd33b3]
  - @gigaichronicle/schema@0.1.0
  - @gigaichronicle/core@0.1.0
  - @gigaichronicle/provider-claude-code@0.1.0
