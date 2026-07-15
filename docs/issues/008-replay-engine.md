# M8 — The Capability: Replay Engine + `chronicle replay` + digests 🚧 GATE

> **Tracking issue (epic)** for GitHub Milestone **`M8 — Replay (GATE)`** · Target: Week 4 · Depends on: M3, M4, M7
> Labels: `epic` `area:core` `area:cli` `type:feature` `P0` `phase-1` `gate`

## Goal

The product's core capability exists headlessly: deterministic reconstruction
of any session as steppable frames, in the terminal, before any UI. Design
law 5 becomes enforceable: *if it can't be replayed, it wasn't captured.*

## Demo — this milestone's demo IS the project gate

An **outside developer** (not the maintainer) runs `chronicle init` →
`chronicle import claude-code` → `chronicle replay <last week's session>` on
their own machine, on their own history. The session is recorded (with
consent) and linked here. **If they don't say "oh," the MVP pauses: no M9/M10
work starts until this lands.** An asciinema of the maintainer's own replay
also goes in the README as the project's first hero artifact.

## Deliverables

- **Engine:** `replay(events ≤ t) → Frame(t)` pure function; `ReplayFrame`
  per [§10.1](../ARCHITECTURE.md#10-replay-engine); frame checkpoints for
  O(1) `frameAt`; fidelity from provider capability declarations; explicit
  gap surfacing.
- **Determinism guarantees:** no wall-clock, randomness, network, provider
  calls, or re-execution inside reconstruction (Spec v3 rules).
- **SDK:** `chronicle.replay.session(id)` async-iterable + `frameAt`.
- **CLI:** `chronicle replay <ses|sha> [--at evt_…] [--json]` — readable,
  paged, ssh-friendly. Riding along: `chronicle inspect`, `chronicle log`,
  `chronicle session promote|privatize`.
- **Digests:** final frame → `ses_*.md` generator (marker, idempotent,
  regenerated on session end + doctor) — the PR artifact (J4).
- **Spec assets:** golden-frame fixtures become the Spec v3 conformance
  corpus seed; **ADR: the frame model** (fields, semantics, checkpoint rules).

## Work breakdown (child issues)

- [ ] ADR: ReplayFrame model + determinism rules (M, decision)
- [ ] Conversation reconstruction (M)
- [ ] Working-set / tool-run / git-context accumulation (M)
- [ ] Gap + fidelity surfacing (S)
- [ ] Checkpointing + `frameAt` (M)
- [ ] Determinism property suite (M)
- [ ] Golden-frame fixtures from M7 recordings (M)
- [ ] `chronicle replay` terminal UX (M)
- [ ] Digest generator (M)
- [ ] `inspect` / `log` / `session` CLI batch (M)
- [ ] Outside-tester gate session — recruit, run, record (S, **process**)

## Definition of Done

1. Determinism property (fast-check): `replay(events)` ≡ `replay(any
   interleaved merge of the same events)`, frame-for-frame.
2. Golden-frame snapshots green on 3 OSes; digest byte-identical across OSes.
3. Fidelity honesty: gap-containing fixture exposes gaps in frames; any
   interpolation across a gap fails the suite.
4. Perf: 1k-event session → final frame <250 ms; frame step <10 ms.
5. **Gate passed:** outside-tester session recorded, "oh" obtained — or a
   written findings issue explaining why not, blocking M9/M10.
6. Process gates: frame ADR merged; hero asciinema in README; changeset;
   `chronicle replay` docs page.

## Risks

| Risk | Mitigation |
|---|---|
| Replay reveals capture gaps M7 didn't know it had (expected!) | That is the *purpose* of replay-first ordering — findings loop back as M7 fixes before UI exists; budget slack in W4 for this loop |
| Terminal UX undersells the capability | Digest + `--json` carry the value even if the pager is plain; UX polish is iterative, gate is about the "oh" |
| Gate fails: outsider is unimpressed | Pre-committed response ([PHASE-0.md §1.4](../PHASE-0.md#1-product-validation) discipline): stop, diagnose (capture fidelity? framing? onboarding?), fix, re-gate — do **not** proceed to pixels to compensate |

## Release / versioning

**`v0.1.0-beta.1` — first shareable build** (headless CLI complete for solo
use). Announce nothing publicly yet; recruit 3–5 outside testers from it.

## References

[ARCHITECTURE.md §10](../ARCHITECTURE.md#10-replay-engine) · [§13–14](../ARCHITECTURE.md#13-core-sdk--api-contract) · [SPEC-ROADMAP.md v3](../SPEC-ROADMAP.md) · [ARCHITECTURE-REVIEW.md §1.1](../ARCHITECTURE-REVIEW.md)
