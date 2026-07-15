# Gigai Chronicle — Final Architecture Review (v2)

> The last gate before implementation: every assumption challenged, every
> feature re-justified against the MVP, complexity removed where it wasn't
> paying rent. Target feel: **GitLens — small, focused, developer-first,
> extensible, trustworthy.** Architecture quality over feature count.
>
> Status: `v2 — 2026-07-14` · Applies to [ARCHITECTURE.md](ARCHITECTURE.md) v2,
> [PHASE-0.md](PHASE-0.md) (approved), and the new companion docs. The cuts
> and changes below are already reflected in those documents; this file is the
> record of *why*.

---

## 1. Assumptions challenged

| # | v1 assumption | Verdict | Consequence |
|---|---|---|---|
| 1 | *The Timeline webview is the killer feature ("the screenshot that markets the product")* | **Wrong — half the story.** The screenshot markets it; **Replay is the capability**. A timeline over an inadequate event model is a pretty list; replay forces the model to be adequate before pixels exist | Replay Engine promoted to a core layer; build order now Capture → Storage → **Replay** → Timeline (ARCHITECTURE.md §10.2); W4 gate is a terminal replay, not a webview |
| 2 | *The architecture is a set of tool adapters around storage* | **Wrong emphasis.** Adapter-centric thinking leaks tool-specifics inward; three v1 sections mentioned Claude Code where they shouldn't have | The Event Engine is the center; one-way pipeline is now design law 4; providers can only `emit()`; lint enforces it (§12) |
| 3 | *`.gigaichronicle/` is settled (A9)* | **Overturned on challenge.** 15 characters of vendor brand in every repo caps the spec's ceiling at "one vendor's file format" and fails the typing test | Renamed **`.chronicle/`**; spec named "Chronicle", brand stays "Gigai Chronicle" (§7.1, D6); trailer follows (D7) |
| 4 | *The prompt library is a P1 must-have* | **Overturned.** FTS history search covers ~70% of the P1 pain (v1 admitted this!); a curated library at MVP drags the product toward "prompt manager" — the exact positioning we banned (Phase-0 §3 v2) | Prompt library → Phase 2. MVP answers "where did I solve this before" with search + replay |
| 5 | *Five sidebar trees at MVP (Projects, Prompts, Knowledge, Tests, Benchmarks)* | **Wrong.** Four of five would be empty shells at launch — an empty tree is a broken promise and reads as vaporware | MVP surface: **one tree (Sessions) + one webview (Timeline)**. Trees arrive with their phases (§15.2) |
| 6 | *Folder/path context is enough to identify a project* | **Insufficient** (and v1 was silent on it). Renames, moves, clones, and forks are everyday events; any path dependence eventually corrupts history | Three-identity model: `prj_` (permanent, committed) / repository fingerprint (derived) / `wks_` (machine-local), with a scenario table proving nothing breaks (§6) |
| 7 | *dot-namespaced event strings (`prompt.submitted`) are fine* | **Kept the idea, fixed the frame.** Lowercase tool-ish strings invited provider-flavored types | One first-class **ChronicleEvent** model; PascalCase journey verbs; `Ext.<provider>.*` quarantine for tool-specific moments (§5.3, D8) |
| 8 | *Config should sketch the full future (sync, plugins keys from day 1)* | **Premature.** Unused config keys are API surface we must honor forever | `config.json` trimmed to what Phase 1 reads; `sync`/`plugins` reserved by spec, absent on disk (§7.3) |
| 9 | *Monthly timeline digests + milestones.yaml at MVP* | **Not load-bearing at minute 5.** Session digests are what teammates read in PRs; monthly rollups serve month-3 retention | `timeline/` → Phase 2. Session digests stay P0 (now defined as replay projections — one renderer, not two) |
| 10 | *`chronicle analyze` at MVP (P2 in v1 table, still in MVP list)* | **Cut cleanly.** Analytics is a retention hook, not conviction-at-minute-5 | → Phase 2 |
| 11 | *Five plugin capability kinds specified up front (`capture/extractor/exporter/linter/command`)* | **Speculative API.** Specifying `linter`/`exporter` two phases early risks freezing wrong contracts | Phase 1 specifies `capture` + `backfill` only; others defined in the phase that ships them (§16) |
| 12 | *Blob spill threshold configurable (`spillThresholdKB`)* | **Knob nobody asked for.** Every config knob is a test matrix row and a support question | Fixed 64KB constant in spec v1; can become configurable later without breaking anything |
| 13 | *Exchange as a named projection entity* | **Redundant once replay exists** — an "exchange" is just a frame slice | Dropped from the model; replay frames are the one reconstruction abstraction (§5.1) |
| 14 | *Claude Code specifics may appear in the promise/marketing ("never lose another Claude Code session")* | **Banned.** Violates provider-agnostic constitution (revision item 1) | Promise is exactly: **"Build software with AI. Never lose the journey."** Vendor names only in works-with lists ([HOMEPAGE.md](HOMEPAGE.md)) |

## 2. What was removed from the MVP (and where it went)

| Removed from MVP | Was | Now | Why removal is safe |
|---|---|---|---|
| Prompt library (save/versions/tree) | P1 | Phase 2 | FTS + replay cover the daily pain; library is additive, format already specced |
| Prompts & Knowledge & Tests & Benchmarks trees | P0 UI | Their phases | Empty trees erode trust; contribution points are additive |
| Monthly digests + `timeline/` dir | P0 | Phase 2 | Session digests carry the PR/review value |
| `chronicle analyze` | MVP list | Phase 2 | Retention feature, not conviction feature |
| `chronicle wrap` (pty tier 3) | ambiguous in v1 | Phase 2 | MVP's provider (hooks+transcripts) never needs tier 3; ladder still specced |
| `chronicle gc` + retention config | MVP list | Phase 2 | Years-of-data problem; keep-all is the only MVP mode |
| Plugin capability kinds beyond capture/backfill | Phase 1 spec | Phase 2–3 | Specify APIs in the phase that proves them |
| `sync`/`plugins` config keys | day-1 config | reserved | No dead surface |
| Configurable spill threshold | config | constant | One less knob |

**Net MVP (unchanged in ambition, smaller in surface):** Event Engine + Store
+ Replay + correlation + redaction + doctor in core; one provider (Claude
Code, hooks + backfill); CLI `init status replay timeline inspect log import
export session doctor`; extension = Sessions tree + Timeline webview. Eight
solo weeks stays credible *because* the surface shrank while the core
deepened (replay).

## 3. What was deliberately kept (challenged and survived)

| Kept | Challenge it survived |
|---|---|
| **SQLite index** at MVP | "Could we grep JSONL for v1?" — No: FTS search and timeline-month queries are P0-adjacent and re-scanning JSONL dies at 100k events. Index is disposable by design, so its cost is bounded |
| **Session digests committed by default** | "Generated files in git?" — Yes: they're the PR artifact humans read (J4) and the organic team-spread vector; `.gitattributes` collapse handles the noise (A3) |
| **Redaction at MVP** | "Post-launch hardening?" — Never: one leaked secret ends the product (R6). Trust is a launch feature |
| **Webview for Timeline** (not native tree) | Replay frames over time genuinely exceed TreeView; it stays the *only* webview, CSP-locked |
| **`chronicle doctor` at MVP** | The zero-egress claim is marketing unless provable on demand |
| **Opt-in git trailer** | Smallest possible git-write exception, biggest correlation payoff, interop with ai-trailers |
| **Structural conflict-freedom** (ULIDs, single-writer files) | The entire git-as-sync story rests on it; property tests keep it honest (R7) |
| **Provider capability declarations** | New in v2 but essential: honesty must be machine-readable, or the UI can't render fidelity truthfully |

## 4. The GitLens test

| Quality | How v2 measures up |
|---|---|
| **Small** | One promise, one pipeline, one first-class model. MVP: 1 provider, 1 tree, 1 webview, 10 CLI commands. Core < 10 runtime deps |
| **Focused** | Records and replays the journey. Doesn't chat, generate, orchestrate, score, or sync through servers. The non-goals list grew in v2; the feature list shrank |
| **Developer-first** | Installs like GitLens (no account, no popup, value in 5 minutes via backfill+replay); CLI parity for everything; plain text a developer can `cat` |
| **Extensible** | Everything integrates through the provider/plugin contract — including our own providers; the spec makes extension possible *without us* ([SPEC-ROADMAP.md](SPEC-ROADMAP.md)) |
| **Trustworthy** | Zero egress provable by CI + doctor; redaction before first write; no surveillance boundary published; append-only honesty events (`CaptureGap`); open spec + MIT |

## 5. Residual risks the review could not remove

1. **Capture fragility is permanent** (R2). The ladder, fingerprinting, and
   honesty events manage it; nothing eliminates it until vendors emit
   natively ([VISION.md §3](VISION.md)).
2. **Replay sets a high bar for providers.** Design law 5 ("if it can't be
   replayed, it wasn't captured") is the right discipline but will slow
   low-quality provider PRs. Accepted: fidelity classes exist precisely so
   partial providers can ship honestly.
3. **The 8-week solo estimate remains aggressive.** Replay adds ~1 week of
   core work; the UI cuts give most of it back. The W4 terminal-replay gate
   is the checkpoint that catches overrun early.
4. **`.chronicle` collision sweep still pending** (ARCHITECTURE.md §24) —
   expected clean; verify before first release.

## 6. Verdict

**Ready for implementation.** The v2 architecture is smaller than v1 in
user-facing surface, deeper in its core, provider-agnostic by constitution,
and specced for a future where it isn't the only implementation. Pending only
sign-off on decisions **D6–D11** (ARCHITECTURE.md §24), implementation begins
with `packages/schema` — the contract before the code.
