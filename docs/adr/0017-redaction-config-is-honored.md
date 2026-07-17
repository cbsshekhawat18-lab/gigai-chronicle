# 0017 — `capture.redaction` is honored (the second inert promise)

- Status: Accepted
- Date: 2026-07-17
- Relates: [ADR-0015](0015-metadata-mode-enforced-in-the-engine.md) (the same
  bug, found first), [ARCHITECTURE §9](../ARCHITECTURE.md) (REDACT stage),
  [ARCHITECTURE §7.3](../ARCHITECTURE.md) (config schema),
  [PHASE-0 §14](../PHASE-0.md#14-privacy-model) (privacy model)

## Context

ADR-0015 found that `capture.mode: "metadata"` was written by `init` and read
by nothing. Its process consequence said config keys that encode a promise
need a test asserting the promise. **So we audited every other promise
`config.json` makes.** Two more were inert:

| Key | Schema | Written by `init` | Read by |
|---|---|---|---|
| `capture.redaction.customPatterns` | `z.array(z.string())` | yes (`[]`) | **nothing** |
| `capture.redaction.secrets` | `z.boolean()` | yes (`true`) | **nothing** |

`createRedactor(envValues)` took no config at all.

`customPatterns` is the serious one, and it is the same shape as ADR-0015:
config promises → nothing reads → the user trusts it → data reaches disk. An
organization adds its own token format (`ACME-INTERNAL-\w+`) precisely because
the built-in pack **cannot** know it, believes those tokens are redacted, and
every one of them is written to `.chronicle/`, committed, and pushed. The
built-in pack cannot save them: not knowing the shape is the whole reason the
key exists.

`secrets` failed safe (we always redacted, even if told not to), so it leaked
nothing — but it was still a lie, and a real need: redaction is irreversible,
so a false positive silently corrupts content with no way back.

## Decision

Honor both, at the same choke point ADR-0015 used, read from the store.

- **`capturePolicyOf(chronicleDir)`** replaces `captureModeOf` as the single
  read: one parse, the whole `capture` policy. Two keys read by two functions
  is how one of them gets forgotten.
- **`createRedactor(envValues, { secrets, customPatterns })`.** The engine
  passes what the store says. `options.captureMode` stays a test-only
  override; nothing else may be caller-supplied.
- **The two keys are independent.** `secrets: false` disables the built-in
  pack and the entropy heuristic. `customPatterns` still apply — **listing a
  pattern IS the request to redact it**, and a user who turned the pack off
  because of a false positive has not thereby withdrawn their own explicit
  asks.
- **User patterns run first**, before the pack, so their `custom` marker wins
  on any overlap: the shape the user named is the one they want reported.
- **An unparseable pattern is skipped, never thrown.** A typo in config must
  not break capture (law 8). `doctor` is where an unusable pattern gets
  surfaced; the engine's job is to keep going.
- **Defaults protect more, never less.** Missing, malformed, or unreadable
  config → `secrets: true`, no custom patterns. Only an explicit `false`
  disables the pack. Failing open on a privacy control because an unrelated
  field rotted would be ADR-0015 in a new costume.
- **Env-harvested values are not config-controlled.** They were found in the
  user's own environment; they are always redacted.

## Consequences

- An org's own secret shapes are actually protected — the key does what the
  schema says it does.
- Users can disable the pack deliberately, which they could always *ask* for
  and never receive. This permits less redaction than before, by explicit
  request only, and is the point of an escape hatch.
- **Custom patterns are user-supplied regexes**, so a pathological pattern can
  backtrack badly and slow capture. It is the user's own config in their own
  repo, and the alternative (no custom patterns) is what this ADR is fixing.
  Compile-once limits the cost; a real guard belongs with `doctor`, which can
  time a pattern against a corpus without a hook waiting on it.
- Tests assert **bytes on disk**, with a control proving the token IS captured
  when the pattern is absent — otherwise a passing test proves only that
  something, somewhere, redacted it.
- `storage.retention.mode` was audited too and is **not** inert: `keep-all` is
  its only legal value, so honoring it means doing nothing, which is what we
  do. Correct by construction, not by accident.

## Alternatives rejected

- **Remove the keys instead.** The honest option when a feature is fake, and
  the founder's stated rule ("if not real, remove"). Rejected because both
  keys are real needs with a published schema behind them, and the
  enforcement is ~30 lines at a choke point that now exists. Removing them
  would strand the compliance persona ADR-0015 just re-earned.
- **Fold `customPatterns` under `secrets: true`.** Would mean turning off the
  pack silently discards the patterns the user wrote by hand. Rejected.
- **Hash-based custom matching (no regex).** Dodges the ReDoS surface but
  cannot match a *shape*, which is the entire requirement. Rejected.
