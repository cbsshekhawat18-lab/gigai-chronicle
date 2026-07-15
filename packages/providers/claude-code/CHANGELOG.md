# @gigaichronicle/provider-claude-code

## 0.1.0

### Minor Changes

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

### Patch Changes

- d225160: M1 — Foundations: monorepo scaffold (pnpm + Turborepo + TypeScript ESM),
  3-OS CI with network-denial test harness, architecture boundary lint
  (dependency direction + provider pipeline rule), governance (MIT, DCO,
  conventional commits), ADR-0001…0006 ratifying decisions D6–D11, performance
  budgets as data, path-edge fixtures. No runtime behavior yet — packages
  export identity only until their owning milestones land.
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
  - @gigaichronicle/plugin-kit@0.0.1
