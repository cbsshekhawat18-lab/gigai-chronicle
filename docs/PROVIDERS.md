# Gigai Chronicle — Official Provider Capability Matrix

> Every provider declares what it can and cannot do, and the product surfaces
> those limits honestly. This table is normative: a provider's machine-readable
> capability declaration (ARCHITECTURE.md §16) must match its row here, and
> claimed fidelity must be demonstrated on conformance fixtures
> ([SPEC-ROADMAP.md](SPEC-ROADMAP.md) v2/v3).
>
> Status: `v2 — 2026-07-14` · Factual basis: [CAPTURE-SURFACES.md](CAPTURE-SURFACES.md)
> (re-verify quarterly; tool formats churn)

---

## 1. Reading the matrix

| Column | Meaning |
|---|---|
| **Capture** | How events are obtained: tier 1 (native hooks) → 2 (log/transcript parsing) → 3 (pty wrap) → 4 (manual). A provider lists its best tier; lower tiers are automatic fallbacks |
| **Replay** | Fidelity ceiling the Replay Engine can honestly reconstruct: **Full** (conversation + tools + files, stepwise), **Partial** (conversation, coarse actions), **Lossy** (text stream / fragments; rendered visibly degraded) |
| **Timeline** | Whether sessions appear as structured timeline entries (always yes once events exist — listed to show degradation, e.g. manual entries are single moments) |
| **Prompts** | Prompt text captured verbatim (post-redaction) |
| **Tool calls** | Agent tool executions (`ToolExecuted`) captured with arguments/outcomes |
| **Files** | File touches (`FileModified` / `FilesAccepted`) attributable to the session |
| **Git correlation** | Quality of prompt↔commit linking achievable (trailer + dirty-set need live capture; import-only providers correlate by time window) |
| **Knowledge extraction** (Phase 2) | Whether transcripts are rich enough for rule-based extractors to find decisions/TODOs |
| **Confidence** | Overall trust in the captured record: High / Medium / Low — surfaced in the UI per session |
| **Maintenance risk** | Likelihood that a vendor release breaks the provider: Low (documented API) / Medium (documented location, churning format) / High (undocumented internals) |

## 2. The matrix

| Provider | Phase | Capture | Replay | Timeline | Prompts | Tool calls | Files | Git correlation | Knowledge | Confidence | Maintenance risk |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Claude Code** | 1 | Tier 1 (hooks) + tier 2 backfill | **Full** | ✅ Structured | ✅ Verbatim | ✅ Full (incl. subagents via `Ext.*`) | ✅ Attributed live | ✅ Exact (trailer) + high (dirty-set) | ✅ Rich | **High** | **Low** (documented hooks) / Medium (transcript format) |
| **Codex CLI** | 2 | Tier 1 (hooks) + tier 2 rollouts *(promoted from tier 2 — capture audit §9)* | **Full** | ✅ Structured | ✅ Verbatim | ✅ Full | ✅ Attributed | ✅ Exact + high | ✅ Rich | **High** | **Low** (documented hooks) / Medium (rollout schema churns) |
| **Gemini CLI** | 2 | Tier 2 (OTel file export, opt-in config) | **Partial** → Full as OTel GenAI semconv matures | ✅ Structured | ✅ With `logPrompts` opt-in | ◐ As telemetry granularity allows | ◐ Coarse | ◐ High (dirty-set, no trailer hook yet) | ◐ Moderate | **Medium** | **Medium** (documented but evolving telemetry) |
| **Cursor (IDE chat)** | 2, experimental, off by default | Tier 2 (state-DB snapshot read, import-only) | **Partial** (messages; no tool/file stream) | ✅ Import entries | ✅ From DB | ❌ | ◐ Inferred only | ◐ Inferred (time window) | ◐ Limited | **Low–Medium** | **High** (undocumented, breaks across releases; fingerprint + fail-soft mandatory) |
| **Windsurf** | On demand | Tier 4 today (extension runs, chat sealed) | Lossy | ◐ Manual moments | Manual only | ❌ | ◐ Watcher heuristics | ◐ Inferred | ❌ | **Low** | — (no adapter to break) |
| **GitHub Copilot** | Future | Tier 4 (manual / chat-export command); 🟠 `chatSessions` import possible later | Lossy → Partial (if import ships) | ◐ | Manual/export only | ❌ | ◐ Watcher heuristics | ◐ Inferred | ❌ | **Low** | High (undocumented storage) |
| **Any CLI tool** (`chronicle wrap`) | 2 | Tier 3 (pty recording) | **Lossy** (text stream; TUI escape noise) | ✅ Session bounds + transcript text | ◐ Unstructured | ❌ | ◐ Via git dirty snapshots | ◐ High (session window is precise) | ❌ | **Medium** | **Low** (we own the wrapper) |
| **Web chats / anything** (`chronicle log`, MCP, extension command) | 1 | Tier 4 (manual) | Lossy (single moments) | ✅ Moments | ✅ What the user pastes | ❌ | ❌ | ◐ Inferred | ❌ | **Low** (but honest: user-authored) | **None** |

*(Every provider also inherits the universal context sources — VS Code file
watchers, git plumbing/hooks — which supply `FileModified`, `GitCommitCreated`,
`BranchChanged` etc. regardless of AI-tool capture quality.)*

## 3. Why provider support differs

Support quality is not our choice — it is a direct function of **what surface
each vendor exposes**, and the honest response is the degradation ladder, not
false parity:

1. **Hooks exist (Claude Code, Codex CLI):** the tool *calls us* at lifecycle
   moments with structured JSON. Full-fidelity, real-time, vendor-supported —
   tier 1, Full replay, low maintenance. These set the ceiling.
2. **Structured logs/telemetry exist (Codex rollouts, Gemini OTel, Claude
   transcripts):** we parse what the tool already writes. Near-full fidelity
   but **version-fragile** — hence fingerprinting, fail-soft to lower tiers,
   and `CaptureDegraded` honesty events.
3. **Internals exist but are unsupported (Cursor state DB, Copilot
   chatSessions):** readable today, breakable tomorrow, and no vendor
   commitment. Shipped experimental, off by default, import-only — so a
   breakage can never take live capture down with it.
4. **Nothing is exposed (Copilot chat via API, Windsurf chat):** extensions
   are sandboxed from each other; no lawful technical path exists. Manual
   capture is the floor, and we say so in docs and marketing rather than
   pretending (honest-data principle; rejected techniques in
   [CAPTURE-SURFACES.md §8](CAPTURE-SURFACES.md#8-rejected-surfaces--impossible-by-policy) stay rejected).

Two structural consequences:

- **Neutrality is preserved by the pipeline, not by equal capture.** Whatever
  the tier, every provider emits the same ChronicleEvents through the same
  Event Engine; downstream, a Codex session and a manually-logged web chat are
  the same species of data, differing only in declared fidelity.
- **Rows improve without architecture changes.** If Cursor ships hooks
  tomorrow, its row upgrades in place: same events, same store, same replay —
  only the provider package changes. That is the point of the design.

## 4. Provider promotion policy

A provider may claim a better row only when:

1. Its capability declaration matches demonstrated behavior on recorded
   fixtures (conformance, Spec v2).
2. Replay of its fixtures meets the claimed fidelity class with golden-frame
   tests (Spec v3).
3. Its failure mode is proven fail-soft: fixture-pinned CI simulates a format
   drift and the provider must degrade with `CaptureDegraded`, not crash.

Demotions are immediate and honest: a broken tier-2 parser drops the live row
to its fallback tier in `chronicle status` and the UI the moment
fingerprinting fails.
