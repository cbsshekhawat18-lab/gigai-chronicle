# M5 — The Only Door: Event Engine (validate → redact → enrich → normalize)

> **Tracking issue (epic)** for GitHub Milestone **`M5 — Event Engine`** · Target: Weeks 2–3 · Depends on: M2, M3
> Labels: `epic` `area:core` `type:feature` `P0` `phase-1` `security`

## Goal

The single door into the store exists and its security promise holds under
attack: **no secret reaches disk, no malformed candidate crashes anything, no
event exists that didn't pass through the engine.** Risk R6 (privacy
backlash) is existential — this milestone is where it's engineered away.

## Demo

A red-team style test session, linked from this epic: a fixture stream
containing every token type in the redaction corpus plus deliberately
malformed candidates → resulting store shown containing only
`[REDACTED:kind:hash8]` markers and `CaptureGap` records; `chronicle doctor
--scan-secrets` confirms clean.

## Deliverables

- **Pipeline stages** per [§9](../ARCHITECTURE.md#9-event-engine): validate
  (shape/size/session/id discipline) → redact (pattern pack + entropy +
  workspace-`.env` harvest, irreversible markers) → enrich (ULID, cached git
  snapshot, workspace id, provenance, visibility) → normalize (core types or
  `Ext.<provider>.*`, else `CaptureGap`).
- **Honesty paths:** `CaptureGap` / `CaptureDegraded` emission; failures never
  propagate into the caller's process (design law 8).
- **API:** the emit surface — the *only* core import allowed to
  `packages/providers/*` (M1 lint already enforces).
- **Security assets:** synthetic redaction corpus (all secrets fabricated —
  policy: **no real credentials in fixtures, ever**, documented in
  `SECURITY.md`); fuzzing harness over candidates.

## Work breakdown (child issues)

- [x] Validate stage + size caps (M) — shape/session/ts discipline, ts coercion to canonical, 1MiB candidate cap
- [x] Redaction: pattern pack (M) · entropy heuristic (M) · `.env` harvest (S) — deep walk over all payload strings; conservative entropy rules with explicit ID/hash/URL/path exclusions
- [x] Marker format + `hash8` scheme (S) — `[REDACTED:kind:hash8]`, stable per secret, irreversible; markers never re-flagged
- [x] Enrich stage + git-snapshot cache (M) — system-git reader, 200ms TTL, injectable; degrades to nulls outside git
- [x] Normalize stage + `Ext.*` registration (M) — strict session bindings; unknown types dropped-with-CaptureGap
- [x] `CaptureGap`/`CaptureDegraded` paths (S) — gap reasons carry NO payload content; `reportDegraded()` convenience
- [x] Synthetic secrets corpus (M) — catch corpus per class + false-positive corpus (equally load-bearing)
- [x] Candidate fuzzing harness (M) — 200 arbitrary candidates: never throws, store verifies clean after
- [x] Store-access privacy test (S) — **honest form:** providers reach core only via the `./emit` subpath (boundary lint enforces the path; `emit-surface.test.ts` pins that the surface exposes engine-only, no store/index/doctor). `EventLog` stays root-exported for apps (CLI/doctor legitimately use it) — the v1 wording "constructors package-private" was unimplementable without breaking M4's sanctioned consumers

**Status 2026-07-15:** implemented and validated — 34 new tests (74 core
total). Red-line leak-guard green: every token class + a planted `.env`
value pushed through the pipeline, raw stream files grepped clean. Full
pipeline p99 4.4ms < 5ms budget. One deviation note: `.env` values are held
in process memory for match-and-replace (hash-only matching cannot do
substring search); never persisted or logged — intent of the risk-table
mitigation preserved, wording corrected here.

## Definition of Done

1. Redaction corpus: 100% of seeded token classes caught; a
   leaked-secret-reaches-store fixture **fails the build**.
2. Fuzzing: no crash, no invalid stored event, ever — malformed input becomes
   `CaptureGap`s.
3. Enrichment determinism: same candidate + same repo state → identical
   envelope (modulo ULID/ts), snapshot-tested.
4. Hot path validate→append < 5 ms p99 in CI.
5. API-level proof that the engine is the only write path.
6. Process gates: security-sensitive PRs get a labeled second review pass
   (even solo — a separate self-review checklist commit); changeset; engine
   docs page.

## Risks

| Risk | Mitigation |
|---|---|
| **False-positive redaction destroys user content irreversibly** | Markers carry `kind` + hash for auditability; entropy thresholds tuned against a *plain-prose* corpus too (false-positive suite is as important as the catch suite); custom allowlist deferred but reserved in config |
| Pattern pack rots as token formats evolve | Corpus is data-driven (one file per token class) — updating is a `good-first-issue`-able PR with tests |
| `.env` harvesting reads files users consider sensitive | Values are hashed in-memory for matching, never stored or logged; behavior documented prominently |

## Release / versioning

Engine + store + schema now form a coherent internal core;
`v0.1.0-alpha.3` internal tag. Redaction behavior documented in a user-facing
`docs/privacy.md` draft (marketing will reuse it — [HOMEPAGE.md](../HOMEPAGE.md) trust block).

## References

[ARCHITECTURE.md §9](../ARCHITECTURE.md#9-event-engine) · [§18](../ARCHITECTURE.md#18-security-model) · design laws 3, 4, 8 · risk R6
