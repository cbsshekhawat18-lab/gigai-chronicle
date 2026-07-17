---
"@gigaichronicle/core": patch
"@gigaichronicle/cli": patch
"gigaichronicle-vscode": patch
---

**Privacy fix (ADR-0015): `--metadata-only` now actually works.**

`chronicle init --metadata-only` promised "event shapes/timings, no prompt
text". The config flag was written by `init` and **never read by anything** —
so full prompt text was captured to `.chronicle/sessions/` regardless, and
since the default visibility is `shared`, a user who enabled high-sensitivity
mode and pushed **published the very text they had asked us not to store**.
This was consent gate 1 (PHASE-0 §14) and the reason the regulated persona
adopts at all.

The mode is now enforced in the Event Engine's REDACT stage — the choke point
every write already passes through — and the engine **reads `capture.mode`
from the store itself** rather than trusting callers to pass it. That is the
actual fix: the gate was open for exactly as long as honoring it was
somebody else's job.

Text bodies are dropped *before* secret redaction (content you asked us never
to store shouldn't be scanned or spilled either) and replaced with a
`[METADATA-ONLY]` marker — never a hash, which would be a dictionary attack
away from the prompt. Shapes survive: type, timings, model, tool names, git
context. An audit trail without the words.

**If you ever relied on `--metadata-only`, audit your store.** Text captured
while the flag was inert is still there; this fix stops new leakage, it does
not rewrite history or un-publish anything already pushed.

Also corrects two UI strings that blamed "metadata-only mode" for any
unreadable prompt — that mode now yields a readable marker, so the remaining
case is a >64KB body spilled to a blob sidecar, and it says so.
