---
"@gigaichronicle/core": patch
---

**Privacy fix (ADR-0017): `capture.redaction` now actually works.**

After ADR-0015 we audited every promise `config.json` makes. Two more were
inert — defined in the schema, written by `init`, and read by nothing:

- **`redaction.customPatterns`** — your own secret shapes were **ignored**.
  An org adding `ACME-INTERNAL-\w+` (precisely because the built-in pack
  cannot know it) had every one of those tokens written to `.chronicle/`,
  committed, and pushed. Same shape as the inert metadata mode.
- **`redaction.secrets`** — `false` was ignored. It failed safe (we redacted
  anyway) so it leaked nothing, but redaction is irreversible, and a false
  positive silently corrupts content with no way back.

Both are now honored in the Event Engine's REDACT stage, read from the store
via `capturePolicyOf()` — one parse for the whole capture policy, because two
keys read by two functions is how one gets forgotten.

The keys are independent: `secrets: false` disables the built-in pack, and
your custom patterns still apply — listing a pattern **is** the request to
redact it. Defaults protect more, never less: missing or malformed config
keeps the pack on; only an explicit `false` disables it. An unparseable
pattern is skipped, never thrown — a config typo must not break capture.

`storage.retention.mode` was audited too and is fine: `keep-all` is its only
legal value, so honoring it means doing nothing, which is what we do.
