# Gigai Chronicle — Future Vision

> **Chronicle as the OpenTelemetry of AI-assisted software development** —
> one open event format for the development journey, a provider ecosystem to
> emit it, a replay ecosystem to consume it, and analytics on top — with **no
> centralized cloud required at any layer**.
>
> Status: `v2 — 2026-07-14` · Companions: [SPEC-ROADMAP.md](SPEC-ROADMAP.md),
> [ARCHITECTURE.md](ARCHITECTURE.md), [PHASE-0.md §20](PHASE-0.md#20-long-term-vision)

---

## 1. The analogy, precisely

Before OpenTelemetry, every APM vendor shipped a proprietary agent and owned
the data it produced; instrumenting for one vendor meant re-instrumenting to
leave. OTel inverted the market: **one open format and semantic conventions,
vendor-neutral instrumentation, and vendors competing on what they do with
the data** — collectors and backends became interchangeable.

AI-assisted development in 2026 is where observability was then: every AI
tool persists its sessions in a proprietary silo (Claude Code transcripts,
Codex rollouts, Cursor's state DB, Copilot's ephemeral chat), unreadable by
the others, unlinked to git, and disposable at the vendor's convenience.

Chronicle's endgame is the same inversion:

| OpenTelemetry concept | Chronicle equivalent |
|---|---|
| OTLP + semantic conventions | **ChronicleEvent envelope + core taxonomy** (Spec v1) |
| Instrumentation libraries | **Providers** (Spec v2) — first-party, community, and eventually *native* |
| Collector pipeline (receive → process → export) | **Event Engine** (validate → redact → enrich → normalize) |
| Trace viewers (Jaeger, Tempo, vendor UIs) | **Replay ecosystem** (Spec v3) — any tool that renders frames from the open store |
| Backends & analytics vendors | **Projections**: timelines, knowledge, reports, org analytics |
| The spec itself, vendor-neutrally governed | **The Chronicle Specification** (CC-BY, implementer-objection process) |
| *No required SaaS anywhere* | *No required cloud anywhere — git is the transport, files are the API* |

One deliberate difference: OTel assumes a collector endpoint; Chronicle
assumes **a directory in a git repository**. That single choice is what makes
the whole stack work with zero infrastructure.

## 2. Open Event Format

The ChronicleEvent (ARCHITECTURE.md §5) is the unit of the ecosystem: one
envelope, PascalCase journey verbs (`PromptSubmitted`, `AIResponseReceived`,
`FilesAccepted`, `GitCommitCreated`…), versioned payload schemas, prefixed
ULIDs, forward-compatibility rules. Published as JSON Schemas + conformance
corpus under CC-BY (Spec v1), it is implementable in any language in an
afternoon — and mapped to **OTel GenAI semantic conventions** (amendment A7)
so existing enterprise observability pipelines can consume journey events
with no custom glue. If a consortium standard emerges later, Chronicle
competes as the best *implementation and store*, whatever the wire format
(risk R8).

## 3. Provider Ecosystem

Three stages, mirroring how OTel instrumentation spread:

1. **First-party providers** (now → Phase 2): Claude Code, Codex CLI, Gemini
   CLI, pty wrap, manual — built by us, honest about fidelity
   ([PROVIDERS.md](PROVIDERS.md)).
2. **Community providers** (Phase 3+): the Provider API (Spec v2) plus
   fixture-based conformance makes an adapter for a new AI tool a
   reviewable weekend PR, in any language via the stdin capture contract.
   Adapters are designed for community ownership (risk R9).
3. **Native emission** (the tipping point): AI tools emit ChronicleEvents
   themselves — the way build tools emit JUnit XML and libraries ship OTel
   instrumentation — because their users demand a journey that survives the
   tool. The moment one major vendor emits natively, the capture problem
   (our hardest engineering problem) starts dissolving; Chronicle's role
   shifts from *scraping* the journey to *keeping* it.

## 4. Replay Ecosystem

Because the store is open and replay is a specified pure function (Spec v3:
same events → same frames, in any implementation), replay tooling doesn't
have to be ours:

- IDE plugins (JetBrains, Neovim via `chronicle daemon` or direct store
  reads) stepping through sessions in-editor.
- Standalone TUI/web replayers for repos you've merely cloned — code review
  with the intent attached.
- Audit and compliance viewers replaying exactly what an agent did before a
  release (P6 → the SBOM-like trajectory below).
- Research tooling replaying thousands of recorded sessions to study how
  humans and agents actually build software.

Golden-frame conformance fixtures keep every replayer honest: gaps must be
shown, fidelity ceilings declared, nothing fabricated.

## 5. Analytics — without a central cloud

Aggregation follows the data's existing gravity instead of creating new
gravity:

- **Individual:** `chronicle analyze` over the local store.
- **Team:** the journey is already on the team's git remote; any CI job can
  run `chronicle analyze --json` across repos the org *already controls* and
  publish dashboards from it. No new trust relationship is created.
- **Org/fleet:** the same pattern over many remotes; optional Chronicle Cloud
  (Phase 4) is a *convenience* for those who want hosted dashboards — a
  paid product, never the substrate (Phase-0 §17).
- **Always within the boundary:** aggregates by project and practice, never
  per-person rankings (A8) — the analytics layer inherits the constitution.

## 6. Open Specification & governance

The spec ([SPEC-ROADMAP.md](SPEC-ROADMAP.md)) versions the ecosystem's five
contracts — Event Schema, Provider API, Replay API, Knowledge API, Cloud
API — under CC-BY with an implementer-objection change process. Neutral
naming everywhere on disk and wire (`.chronicle/`, `ChronicleEvent`,
`Chronicle-Session:`): a competitor must be able to implement Chronicle
without advertising us. **The spec wins when it has competitors** — like git,
adoption requires trusting nobody.

## 7. Third-party integrations (the JUnit-XML effect)

Once the journey is a standard artifact in the repo, tools that never talk to
us can build on it:

- **CI**: emit `DeploymentDetected` / `BenchmarkExecuted` events from
  workflows; attach session digests to release notes.
- **Code review**: PR bots render the linked session digest beside the diff;
  reviewers read intent, not just output (J4).
- **Compliance & provenance**: commit-anchored, confidence-scored journey
  records become the attestation format for "how was this code made" — the
  SBOM trajectory for AI involvement (P6), consumable by policy engines.
- **Editors & platforms**: GitHub/GitLab could render `.chronicle/` natively
  the way they render Markdown — the format needs no runtime.

## 8. Why no centralized cloud — structurally, not ideologically

Every layer above rides infrastructure developers already run:

- **Transport:** git push/pull (structurally conflict-free store — no sync
  service to operate).
- **Storage:** the repository itself (plain text, ten-year test).
- **Compute:** local CLI/extension, or the org's own CI.
- **Identity:** the project ULID committed in-repo; workspaces are local.
- **Trust:** `cat`-auditable files + zero-egress defaults provable by
  `chronicle doctor`.

A centralized service would add a single point of failure, a privacy target,
and a company-lifetime dependency to a record whose entire value is outliving
companies (Humanloop lesson, Phase-0 §1.3). The optional cloud therefore only
ever sells *coordination convenience* — dashboards, hosted sync, SSO — never
capability, and the ecosystem must remain fully functional if it never exists.

## 9. Milestones that would prove the vision

1. `.chronicle/` directories appearing organically in public GitHub repos
   (Year 1 — the habit).
2. First community provider merged; first third-party reader shipped without
   talking to us (Year 2 — the API works).
3. First AI tool emitting ChronicleEvents natively (Year 2–3 — the JUnit
   moment).
4. First org citing Chronicle records in an AI-involvement audit (Year 3 —
   the attestation format).
5. A competing implementation passing the conformance corpus (any year — the
   day Chronicle stops being ours and starts being infrastructure. That is
   the win condition.)
