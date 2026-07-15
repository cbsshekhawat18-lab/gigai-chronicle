# M7 — First Provider: Claude Code (live hooks + transcript backfill)

> **Tracking issue (epic)** for GitHub Milestone **`M7 — Provider #1`** · Target: Week 3 · Depends on: M5, M6
> Labels: `epic` `area:providers` `type:feature` `P0` `phase-1`

## Goal

Real sessions flow into the store, live and from history — through the first
provider, built deliberately as the *template* every future provider
(community included) will copy. First provider, never the identity
([ARCHITECTURE.md §1](../ARCHITECTURE.md#1-what-gigai-chronicle-is-and-is-not)).

## Demo

Two recordings linked from this epic: (1) a live session in a fixture repo
with `chronicle status` showing tier-1 capture in real time and zero
perceptible tool latency; (2) `chronicle import claude-code` backfilling a
month of transcripts in seconds.

## Deliverables

- **Tier 1 (hooks):** event mapping per [CAPTURE-SURFACES.md §2.1](../CAPTURE-SURFACES.md#2-claude-code--the-flagship-surface)
  (`SessionStart/End`, `UserPromptSubmit`, `Stop` + transcript enrichment,
  `PostToolUse(+Failure)`, `FileChanged`; sub-agent/permission moments →
  `Ext.claude-code.*`); ingestion via `chronicle capture claude-code --event`
  reading stdin — **fire-and-forget: <5 ms, no network, exit 0 always**.
- **Install UX:** settings-merge in `chronicle init` — show the diff, never
  clobber, project-or-user scope choice, one-command uninstall.
- **Tier 2 (backfill):** `chronicle import claude-code` over
  `~/.claude/projects/<cwd-slug>/*.jsonl`; uses `WorkspaceMoved` history for
  old paths; idempotent.
- **Fail-soft:** transcript format **version fingerprinting**; unknown format
  → `CaptureDegraded` + clean skip report.
- **Provider template assets:** capability declaration matching its
  [PROVIDERS.md](../PROVIDERS.md) row; sanitized fixture transcripts in
  `examples/` (**sanitization policy documented** — fixtures are synthetic or
  scrubbed-and-reviewed, never raw user data); `docs/providers/writing-a-provider.md`
  first draft extracted from this implementation (Spec v2 seed).

## Work breakdown (child issues)

- [ ] Hook event mapping + `Ext.*` registrations (M)
- [ ] `chronicle capture` stdin ingestion path, <5 ms budget (M)
- [ ] Settings-merge install/uninstall UX (M)
- [ ] Transcript parser + fingerprinting (L)
- [ ] `import` command: discovery, idempotency, moved-path handling (M)
- [ ] Sanitized fixture set + sanitization policy doc (M)
- [ ] Capability declaration + conformance check vs PROVIDERS.md row (S)
- [ ] "Writing a provider" guide draft (M)
- [ ] Extra fixture scenarios (long sessions, resume, subagents) (S) `good-first-issue`

## Definition of Done

1. Live capture e2e: real session → conformant JSONL (prompts/responses/
   tools/files); hook p99 <5 ms; exit 0 even on internal error (error →
   `.local/ops/`).
2. Backfill of the fixture month is idempotent (re-run adds zero events).
3. Format-drift CI canary: mutated future-format fixture → `CaptureDegraded`
   + skip; current-format fixture failing to parse turns the build red.
4. Parser fuzzing green (untrusted input, no crash, no invalid event).
5. Provider imports nothing from core but the emit surface (M1 lint).
6. Process gates: quarterly re-verify reminder added (formats churn — capture
   audit header); provider guide draft merged; changeset.

## Risks

| Risk | Mitigation |
|---|---|
| **Claude Code format/hook churn** (the permanent risk R2) | Fingerprint pin + CI canary makes drift loud within a day; fail-soft keeps users capturing at lower tiers; quarterly re-verification is calendarized |
| Hook slows the user's tool → uninstall + reputation damage | The <5 ms/exit-0 budget is a CI-enforced test with a spawned-process harness, not a guideline |
| Fixture sanitization mistake ships someone's real data | Two-pass rule: automated secret scan + manual checklist review on every fixture PR; policy in CONTRIBUTING.md |

## Release / versioning

**`v0.1.0-alpha.5` — the first internally dogfoodable build.** From this tag
onward, Chronicle records its own development ("chronicle chronicles
chronicle") — dogfood findings feed M8.

## References

[CAPTURE-SURFACES.md §2](../CAPTURE-SURFACES.md#2-claude-code--the-flagship-surface) · [PROVIDERS.md](../PROVIDERS.md) · [ARCHITECTURE.md §4, §16](../ARCHITECTURE.md#4-the-hard-problem-capture)
