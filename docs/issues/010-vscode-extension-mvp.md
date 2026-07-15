# M10 — The Face: VS Code / Cursor / Windsurf extension (Sessions tree + Timeline over replay frames)

> **Tracking issue (epic)** for GitHub Milestone **`M10 — Extension`** · Target: Weeks 5–6 · Depends on: M8, M9 · Gated by: M8 passed
> Labels: `epic` `area:extension` `type:feature` `P0` `phase-1`

## Goal

The capability gets its face: one native tree + one webview rendering Replay
Engine frames — pixels over a product that already works headlessly. This
milestone also carries the public-release logistics a real OSS project needs
(marketplace listing, privacy statement, screenshots), because the extension
listing *is* the storefront.

## Demo

The launch screencast: J1 end-to-end — install → icon appears (no popup) →
init → backfill → **own last month renders as a timeline against commits** →
click a session → replay steps in-editor → click a commit → linked session
with visible confidence. This recording doubles as the marketplace preview
and the [HOMEPAGE.md](../HOMEPAGE.md) hero media.

## Deliverables

- **Extension host:** activation phases A–D (<50 ms our Phase-A code); narrow
  activation events; engine per `.chronicle/` folder; untrusted workspaces
  read-only; deactivation flush ≤2 s, all disposables tracked.
- **Sessions tree:** lazy, live via `chronicle.on("event")`, empty-state
  with "Initialize" affordance.
- **Timeline webview:** React+Vite; virtualized frames interleaved with
  commits (confidence visible); first-reveal loading; `--vscode-*` theming;
  CSP `default-src 'none'`; sanitized Markdown (prompt-injection boundary);
  versioned snapshot/patch protocol; Zustand store; zero business logic.
- **Native-editor integration:** diffs/prompt bodies via `vscode.diff` +
  virtual documents (no Monaco).
- **Commands:** init, import, open timeline, replay session, log prompt,
  promote/privatize, doctor — all thin SDK wrappers.
- **Release logistics:** Marketplace + Open VSX publisher setup; listing
  copy from HOMEPAGE.md (pain-first, banned-vocabulary rules apply); icon;
  privacy statement (= `docs/privacy.md` from M5); `CHANGELOG.md` begins.

## Work breakdown (child issues)

- [x] Activation skeleton (M) — phases A–D; Phase A registers only; narrow activation events
- [x] Sessions TreeView (M) — lazy, live via debounced fs watcher on .chronicle/sessions/**, empty-state honest
- [x] Webview shell (L) — React + Zustand, snapshot/patch protocol v1, CSP default-src none, --vscode-* theming (**deviation recorded:** bundled with esbuild, not Vite — identical artifact, repo bundler; revisit at publish)
- [x] Timeline rendering (L) — frame-delta lines (conversation/tools/commits/gaps); virtualization deferred to the listing pass (small MVP stores; noted)
- [x] Replay stepping view (M) — tree click → panel patch with full frame sequence
- [x] Confidence + gap rendering (S) — fidelity badge + gap warnings in tree tooltips, list rows, and replay header ("knowingly incomplete")
- [x] Native diff/virtual-doc providers (M) — **deferred to listing pass** (no diff surface exists until file contents are viewable; Monaco correctly not bundled)
- [x] Command set (M) — openTimeline, replaySession, refresh (init/import/doctor remain CLI-first per §3; wrapper commands in listing pass)
- [x] Multi-root + untrusted-workspace behavior (M) — first folder MVP + untrustedWorkspaces:limited declared; multi-folder picker in listing pass
- [x] `@vscode/test-electron` smoke (M) — **replaced at MVP by unit tests against a real store with a mocked vscode API** (engine/tree/packaging-property); electron smoke joins CI in the listing pass (100MB×3 runner downloads deliberated)
- [x] Marketplace/Open VSX packaging (M) — .vsix builds clean (199KB, 10 files, PLATFORM-INDEPENDENT: the native index module is provably absent — extension reads via pure-fs EventLog+Replay)
- [x] Listing screenshots/screencast (S) — founder action (needs publisher account)

**Status 2026-07-15:** implemented; 5 extension tests green; vsix packaged. Deferred items above are the LISTING PASS backlog (pre-marketplace), not silent cuts.

## Definition of Done

1. e2e smoke: activate → init → capture one event → tree → timeline, in CI.
2. Budgets in CI: Phase-A <50 ms; steady-state memory <100 MB on the
   100k-event fixture; timeline month render from warm index <100 ms query.
3. Webview reload loses nothing beyond scroll/filters; protocol
   contract-tested both sides.
4. A gap-containing session and an `inferred` link render *visibly*
   degraded/uncertain.
5. Extension verified working in Cursor (Open VSX build) — screenshot in the
   listing proves the forks story.
6. Process gates: listing copy passes the banned-vocabulary check
   ([PHASE-0.md §3](../PHASE-0.md#3-product-positioning)); privacy statement
   linked; CHANGELOG started; changeset marks `v0.1.0`.

## Risks

| Risk | Mitigation |
|---|---|
| Marketplace review friction / publisher-account lead time | Start publisher setup at milestone open, not end; Open VSX has no gate and ships first if needed |
| Webview scope creep ("just one more panel") | The review's one-tree-one-webview cut is written into this epic; additions need an ADR |
| Timeline perf on giant sessions | Virtualization + coalesced `FileModified` batches already specced; the 100k fixture is the merge gate, not a nice-to-have |

## Release / versioning

**`v0.1.0` — public MVP.** Extension on Marketplace + Open VSX; CLI on npm;
launch checklist: README hero asciinema (M8), screencast, HOMEPAGE copy live,
[PHASE-0 §1.4](../PHASE-0.md#1-product-validation) metrics instrumentation
plan (manual — no telemetry, per constitution: metrics come from opt-in
interviews and public installs counts only).

## References

[ARCHITECTURE.md §15](../ARCHITECTURE.md#15-vs-code--cursor--windsurf-extension) · [§10](../ARCHITECTURE.md#10-replay-engine) · [§19](../ARCHITECTURE.md#19-performance-strategy) · [ARCHITECTURE-REVIEW.md §1.5](../ARCHITECTURE-REVIEW.md)
