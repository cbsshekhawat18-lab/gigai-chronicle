# The Chronicle Specification — Open Standard Roadmap

> **Chronicle** is the open specification. **Gigai Chronicle** is its flagship
> implementation. The spec must be implementable — and governed — as if Gigai
> did not exist.
>
> Status: `v2 planning document — 2026-07-14` · Spec license: **CC-BY 4.0**
> (implementation code: MIT) · Companion: [ARCHITECTURE.md](ARCHITECTURE.md),
> [VISION.md](VISION.md)

---

## 1. Why the spec is the product

Formats outlive programs — git's and SQLite's own lesson, and the reason the
ten-year test ([PHASE-0.md §20](PHASE-0.md#20-long-term-vision)) is passable
at all. If Gigai Chronicle the project dies, every committed `.chronicle/`
directory must remain a complete, human-readable record *and* every
third-party tool built on the spec must keep working. That only holds if the
spec is:

1. **Published independently** of the implementation (own repo, own version
   line, CC-BY).
2. **Named neutrally** — "Chronicle", `.chronicle/`, `ChronicleEvent`,
   `Chronicle-Session:` — no vendor brand in any on-disk or wire artifact
   (ARCHITECTURE.md §7.1, decision D6/D7).
3. **Testable without us** — a conformance corpus of fixtures any
   implementation can run against, in any language.

---

## 2. Versioned specification roadmap

Each spec version is a separate, independently stabilized document. Later
versions never modify earlier ones — they add contracts on top. A tool may
implement only v1 and be a fully conformant *Chronicle store reader/writer*.

| Spec | Name | Contracts defined | Stability path |
|---|---|---|---|
| **v1** | **Event Schema** | The ChronicleEvent envelope; the core event taxonomy (PascalCase types + versioned payload JSON Schemas); ID rules (prefixed ULIDs); the `.chronicle/` directory layout; JSONL sharding + single-writer rule; blob spill-over; redaction marker format (`[REDACTED:kind:hash8]`); generated-file markers; visibility classes (`shared`/`local`); `config.json` schema; identity model (`prj_`/`wks_`/repository fingerprint) | Draft with MVP → **frozen at 1.0** at first public release; additive evolution only |
| **v2** | **Provider API** | The provider manifest (id, capabilities, permissions, capability declaration); the capture contract (`detect` / `start(emit)` / `backfill(emit, since)`); the raw-candidate shape handed to an Event Engine; the hook ingestion contract (`chronicle capture <provider> --event <name>` reading JSON on stdin); tier semantics (1–4); format-fingerprinting and fail-soft (`CaptureDegraded`) requirements; provider conformance suite | Draft in Phase 1 (our own providers are the test); public at Phase 2 when second/third providers ship |
| **v3** | **Replay API** | The frame model (`ReplayFrame`: conversation, workingSet, tools, git, gaps, fidelity); determinism rules (replay is a pure function of the event stream; no network, no model calls, no re-execution); fidelity classes (full/partial/lossy) and their honesty requirements; gap semantics (`CaptureGap` must surface, never be interpolated); frame-seek/checkpoint behavior; golden-frame conformance fixtures | Draft in Phase 1 (replay ships in MVP); public once two independent frame consumers exist (CLI + webview) |
| **v4** | **Knowledge API** | Extractor contract (frame-walkers in, knowledge candidates out); knowledge entity file formats (MADR-style ADRs, requirements, TODOs — one entity per file); `KnowledgeExtracted` payloads; the link/confidence model (`exact`/`high`/`inferred`, `LinkConfirmed`/`LinkRejected` override semantics); provenance rules (model-derived content must be labeled) | Phase 2 |
| **v5** | **Cloud API** | Sync protocol (event set-union, checkpoints, outbox semantics); REST surface (`POST /v1/projects/:id/events:batch`, `GET …/events?after=`); privacy tiers 0–2 and server-side schema rejection of file contents; E2EE envelope; deletion/tombstone propagation | Phase 4; explicitly optional — a conformant Chronicle ecosystem needs no cloud at all |

**Change process** (stricter than the software's): every breaking-change
proposal is a public RFC; **any registered implementer may object**; objections
require resolution or version-gating. The spec repo is governed per the
staged-governance ladder in [PHASE-0.md §16](PHASE-0.md#16-open-source-strategy),
with the format explicitly under the stricter track.

---

## 3. Implementing Chronicle without Gigai software

A third-party editor, IDE plugin, or CLI implements Chronicle using only
published artifacts — no Gigai dependency, no Node.js requirement, no network:

**What we publish (per spec version):**

1. **The spec documents** (CC-BY) — prose + normative rules.
2. **JSON Schemas** for the envelope, every core event payload, and
   `config.json` — language-neutral, fetchable and vendored.
3. **The conformance corpus** — fixture `.chronicle/` directories with
   valid/invalid event files, torn-write cases, forward-compat cases
   (v+1 documents with unknown fields), recorded sessions with **golden
   replay frames**, and correlation scenarios with expected links.
4. **A conformance checker** — `chronicle spec verify <dir>` (part of our
   CLI, but the corpus is the contract; any implementation that round-trips
   the corpus is conformant, whether or not it ever runs our checker).

**What a third party can build, at each conformance level:**

| Level | Implements | Example |
|---|---|---|
| **Reader** | Spec v1 read side: parse events, render sessions | A JetBrains plugin (Kotlin) showing the journey for a cloned repo; a `grep`-class Rust TUI |
| **Writer** | v1 write side: append conformant events, single-writer discipline, redaction markers | A Neovim plugin logging manual captures; a CI step emitting `DeploymentDetected` |
| **Provider** | v2: capture a tool's activity into candidates | A community provider for a new AI CLI, in any language, emitting via the stdin contract |
| **Replayer** | v3: frames from events, deterministically | An independent web-based session replayer; an audit tool stepping a session for compliance review |
| **Full platform** | v1–v4 | A competing product — explicitly welcome; the spec wins when it has competitors ([VISION.md](VISION.md)) |

**Interop guarantees that make this real:**

- Everything canonical is plain text (Markdown/JSON/JSONL/YAML) — `cat` is a
  conformant reader of last resort.
- The read-forward rule (ARCHITECTURE.md §22) is a *spec* rule: unknown fields
  preserved byte-for-byte, newer versions refused loudly, never silently.
- The SQLite index is explicitly **out of spec** — it is an implementation
  cache. Implementations may build any index they like or none.
- Trademark policy: implementations may describe themselves as
  **"Chronicle-compatible"** (subject to passing the conformance corpus);
  "Gigai" and "Gigai Chronicle" remain implementation brands (pre-release
  counsel item, ARCHITECTURE.md §24).

---

## 4. Sequencing against the product roadmap

| Product phase | Spec activity |
|---|---|
| MVP (Phase 1) | v1 drafted alongside `packages/schema` (the schemas *are* the spec artifacts); v2–v3 drafted from our own providers/replay as living tests; corpus seeded from `examples/` |
| Phase 2 | v1 frozen at 1.0; v2 published (second + third providers prove it); v3 published (two frame consumers exist) |
| Phase 3 | v4 published with knowledge layer; third-party plugin loading ships against v2 |
| Phase 4 | v5 published with the optional cloud; OTel GenAI semantic-convention mapping published as a companion note (amendment A7, [VISION.md](VISION.md)) |

The discipline throughout: **nothing enters the spec until it has shipped and
survived contact in the implementation, and nothing ships in the
implementation's on-disk surface that isn't destined for the spec.**
