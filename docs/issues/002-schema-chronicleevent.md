# M2 — The Contract: `packages/schema` (ChronicleEvent + Spec v1 artifacts)

> **Tracking issue (epic)** for GitHub Milestone **`M2 — Schema`** · Target: Weeks 1–2 · Depends on: M1
> Labels: `epic` `area:schema` `type:feature` `P0` `phase-1` `spec`

## Goal

The Chronicle Spec v1 exists as executable artifacts: envelope + core event
schemas + fixture corpus, vendor-neutral enough to publish under CC-BY —
"the contract before the code" ([ARCHITECTURE.md §24](../ARCHITECTURE.md#24-decision-log-resolved--newly-open)).

## Demo

A short doc page (`packages/schema/README.md`) renders the envelope and one
event of each lifecycle stage with copy-pasteable JSON that validates —
effectively the first public draft of the spec. Linked from this epic.

## Deliverables

- **Schemas:** envelope per [§5.2](../ARCHITECTURE.md#5-the-chronicleevent-model);
  payload schemas for the Phase-1 core set (§5.3, 20 types); `Ext.<id>.*`
  namespace rules; `config.json` schema (trimmed v2 surface).
- **Types & IDs:** zod defs + generated TS types; prefixed-ULID
  parser/generator (`evt_ ses_ prj_ wks_ prm_ dec_ req_ bmk_`).
- **Conformance corpus (seed):** valid/invalid fixture pair per schema;
  forward-compat fixtures (v+1 docs with unknown fields) — these files are
  the beginning of the public corpus in [SPEC-ROADMAP.md §3](../SPEC-ROADMAP.md).
- **Docs:** schema README = Spec v1 draft 0; taxonomy table with
  old-name→new-name mapping kept in sync with ARCHITECTURE §5.3.

## Work breakdown (child issues)

- [ ] Envelope schema + zod + types (M)
- [ ] Lifecycle events (`ProjectCreated/Opened`, `SessionStarted/Ended`, `WorkspaceMoved`) (S)
- [ ] Conversation events (`PromptSubmitted/Edited`, `AIResponseReceived`) (S)
- [ ] Action events (`ToolExecuted`, `FileModified`, `FilesAccepted/Rejected`) (S)
- [ ] Git events (`GitCommitCreated`, `GitPush`, `BranchChanged`, `GitTagCreated`) (S)
- [ ] Honesty/link events (`CaptureGap/Degraded`, `LinkConfirmed/Rejected`) (S)
- [ ] ULID module (S) `good-first-issue`
- [ ] `config.json` schema (S)
- [ ] Fixture pairs per type (S×N) `good-first-issue`
- [ ] Forward-compat property tests (M)
- [ ] Spec v1 draft README (M)

## Definition of Done

1. Every core type: JSON Schema + ≥1 valid + ≥1 invalid fixture; golden
   round-trips green.
2. Forward-compat property: v+1 fixtures survive read→write byte-preserved.
3. Neutrality audit: no vendor/tool identifier appears in schema *structure*
   (names may appear only as example values) — grep-enforced in CI.
4. Zero runtime deps beyond zod; consumable outside Node.
5. Process gates: changeset; ADR for any deviation from §5.3 as written;
   schema README published in-repo.

## Risks

| Risk | Mitigation |
|---|---|
| Taxonomy churn later invalidates the corpus | Envelope frozen here; payload schemas versioned (`PromptSubmitted/1`) so evolution is additive |
| Over-modeling payloads before capture reality (M4/M7) bites | Payloads start minimal; M7 is explicitly allowed to propose additive fields via ADR |

## Release / versioning

`@gigaichronicle/schema@0.1.0-alpha` publishable (not yet published) —
first Changesets-managed version in the repo.

## References

[ARCHITECTURE.md §5](../ARCHITECTURE.md#5-the-chronicleevent-model) · [SPEC-ROADMAP.md](../SPEC-ROADMAP.md) · [§21 (schema tests)](../ARCHITECTURE.md#21-testing-strategy)
