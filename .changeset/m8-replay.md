---
"@gigaichronicle/core": minor
"@gigaichronicle/cli": minor
"@gigaichronicle/provider-claude-code": patch
---

M8 — The Capability: Replay. Pure deterministic Replay Engine (ADR-0010:
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
