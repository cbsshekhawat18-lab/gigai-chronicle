# 0015 — The high-sensitivity capture mode is enforced in the engine (privacy fix)

- Status: Accepted
- Date: 2026-07-17
- Relates: [ARCHITECTURE §9](../ARCHITECTURE.md) (Event Engine: nothing reaches
  disk unredacted), [ARCHITECTURE §7.3](../ARCHITECTURE.md) (config schema),
  [PHASE-0 §14](../PHASE-0.md#14-privacy-model) (consent gates),
  [PHASE-0 §1.1](../PHASE-0.md#11-the-problem-stated-precisely) (P6),
  [PHASE-0 §6](../PHASE-0.md#6-user-personas) (persona 3 — regulated)

## Context

`chronicle init --metadata-only` advertised *"high-sensitivity mode: event
shapes/timings, no prompt text"*. The config schema defined it
(`capture.mode: "full" | "metadata"`). `init` wrote it. **Nothing ever read
it.**

Verified on a clean repo, with the shipped CLI, before this ADR:

```console
$ chronicle init --yes --metadata-only     # capture.mode = metadata ✓
$ …capture a prompt containing "Acme Corp"…
$ grep -rl "Acme Corp" .chronicle/
  .chronicle/sessions/2026/07/ses_01KXQXKG….jsonl    ← the full text, on disk
```

The only other places the word "metadata" appeared were UI strings *claiming*
text was absent because of a mode that did nothing.

This is not a missing feature. It is a **broken promise in the one area the
product sells trust**:

- PHASE-0 §14 lists it as **consent gate 1** — *"capture at all — chosen at
  `chronicle init`, including a metadata-only mode for sensitive repos"*.
  Gate 1 was open.
- PHASE-0 §6 persona 3 (regulated/enterprise) adopts *because of* it:
  *"local-first satisfies security review; metadata-only redaction mode"*.
- The default `capture.visibility` is `"shared"`, so `.chronicle/sessions/`
  is committed and pushed. A user who enabled high-sensitivity mode, typed
  something confidential, and pushed **published it to their remote** — while
  the CLI told them the opposite.

### Root cause (the part worth remembering)

The mode was inert *for exactly as long as honoring it was somebody else's
job*. `init` wrote a flag; enforcing it belonged to no one. Every provider,
every import path, every future caller would have had to remember.

**A privacy control that depends on callers remembering is not a control.**

## Decision

Enforce the mode at the single choke point every write already passes
through, and read it from the store rather than from the caller.

- **Where:** the Event Engine's **REDACT** stage (§9). The engine's existing
  guarantee is *"nothing reaches disk unredacted; stage 2 runs before any
  write"* — high-sensitivity mode is a redaction policy and belongs under the
  same guarantee.
- **Text bodies are dropped BEFORE secret redaction.** Content the user asked
  us never to store should not be scanned, spilled to a sidecar, or written
  at all.
- **`EventEngine.open()` reads `capture.mode` from `config.json` itself.**
  `options.captureMode` exists only as a test override. The default is the
  safe one, so no caller can forget — the failure mode that caused this.
- **What is stripped:** the `text` body (the field the schema types as
  `textOrBlobSchema`: PromptSubmitted, PromptEdited, AIResponseReceived),
  replaced with the `[METADATA-ONLY]` marker. Type, timings, model, tool
  names, and git context stay: the mode is an audit trail **without the
  words**, which is precisely what P6 asks for.
- **A marker, never a hash.** A hash of a short prompt is a dictionary attack
  away from the prompt — it would leak the thing being protected.
- **Read tolerantly.** A config too broken to schema-validate can still say
  `"metadata"`; failing open on the gate because an unrelated field rotted
  would be this same bug in a new costume. An unreadable config yields
  `"full"` (the schema's documented default) and is `doctor`'s problem.

## Consequences

- Consent gate 1 is real. Proven end to end against the bytes on disk, not
  against the engine's return value — the bug was never in what the engine
  *said*.
- Existing stores are unaffected: nothing is rewritten. Text already captured
  under the inert mode **stays captured**. Anyone who trusted the old flag
  must be told to audit and purge; this ADR does not pretend a code change
  un-publishes a pushed prompt.
- `why` and the replay surfaces show `[METADATA-ONLY]` where the words were.
  That is honest on its face and needs no special-casing.
- Corrected two UI strings that reported *any* unreadable prompt as
  "metadata-only mode". After this, that mode yields a real marker string, so
  the only remaining null is a >64KB body in a blob sidecar — a different
  thing, now labelled as such.
- **Process consequence.** This shipped in a repo whose operating contract
  says *"Reliability beats features, every time. That trust is the product."*
  It survived because a config flag with no enforcement looks exactly like a
  feature in a diff, and nothing tested the promise. Config keys that encode
  a promise need a test asserting the promise, not the key.

## Alternatives rejected

- **Pass the mode in `EventEngineOptions` and require callers to honor it.**
  This is what the code effectively did, and it is why the gate was open for
  the entire life of the flag. Rejected.
- **Filter at read time (hide text in the UI).** The text would still be on
  disk, still committed, still pushed. The promise is about the bytes, not
  the pixels. Rejected.
- **Drop the flag entirely.** Defensible — an absent feature beats a fake
  one — but P6 and persona 3 are real, and the enforcement is ~40 lines at a
  choke point that already exists. Rejected in favor of making it true.
