# M4 — Disposable Speed: SQLite index (FTS5) + `chronicle doctor` + CLI skeleton

> **Tracking issue (epic)** for GitHub Milestone **`M4 — Index/Doctor`** · Target: Week 2 · Depends on: M3
> Labels: `epic` `area:core` `area:cli` `type:feature` `P0` `phase-1`

## Goal

All reads become fast and all caches become disposable: the SQLite index can
be deleted at any time and rebuilt identically, and `chronicle doctor` exists
as the product's trust anchor — integrity, freshness, and the provable
zero-egress report.

## Demo

Terminal recording: `rm .chronicle/.cache/index.db` → `chronicle doctor
--reindex` → identical query results (checksummed); followed by `chronicle
doctor` printing the empty egress configuration.

## Deliverables

- **Index:** `.cache/index.db` WAL; tables `events, sessions, files_touched,
  links, events_fts, meta`; incremental cursor consumer; rebuild-from-scratch
  as the only "migration."
- **Query API:** `chronicle.query.timeline/sessions/search/commitLinks` with
  typed `ChronicleError` codes ([§13](../ARCHITECTURE.md#13-core-sdk--api-contract)).
- **CLI skeleton:** commander + esbuild single-file + lazy subcommands;
  `--json` convention (`apiVersion` in every response); exit codes `0/1/2/3`;
  first commands: `doctor`, `timeline` (raw), `status` (stub).
- **Doctor:** `--reindex`, `--scan-secrets` (retroactive audit), log
  integrity, index freshness, provider health slots, **egress report**.
- **ADR:** SQLite driver choice (native `better-sqlite3` vs WASM) with the
  cross-platform build story — this is a real OSS support-burden decision.

## Work breakdown (child issues)

- [ ] ADR: SQLite driver + prebuild strategy (S, decision)
- [ ] Index schema + incremental consumer (L)
- [ ] FTS5 pipeline (S)
- [ ] Rebuild-from-scratch path (M)
- [ ] Query API + typed errors (M)
- [ ] CLI skeleton + `--json` snapshot-test harness (M)
- [ ] `chronicle doctor` (M)
- [ ] 100k-event fixture generator (M) — shared by all perf gates
- [ ] `--json` output snapshots (S) `good-first-issue`

## Definition of Done

1. Property: rebuilt index ≡ incrementally built index, row-for-row.
2. Perf on the 100k fixture: month query <100 ms; FTS <200 ms; rebuild <30 s;
   CLI cold start <150 ms — all asserted in CI.
3. Doctor egress report snapshot-tested; `--scan-secrets` finds a planted
   marker-evading fixture.
4. `--json` snapshots exist for every command (they are the compatibility
   contract from now on — changing one requires a changeset marked `minor`).
5. Process gates: driver ADR merged; changeset; docs for every CLI command
   (`chronicle <cmd> --help` text reviewed).

## Risks

| Risk | Mitigation |
|---|---|
| Native SQLite builds break on some user setups (classic OSS issue-tracker flood) | The ADR must choose with eyes open; prebuilds for all CI targets; WASM fallback evaluated; decision reversible because the index is disposable |
| FTS tokenizer quality for code-ish text | Corpus of realistic prompts in fixtures; tokenizer choice noted in ADR as revisitable |
| Index schema churn during M8–M10 | Free by design: bump version ⇒ rebuild; no migration code exists to maintain |

## Release / versioning

CLI runnable end-to-end for the first time (`doctor` on a hand-made store).
No public release; `v0.1.0-alpha.2` internal tag.

## References

[ARCHITECTURE.md §8](../ARCHITECTURE.md#8-chronicle-store-storage-engine) · [§14](../ARCHITECTURE.md#14-cli-design) · [§19](../ARCHITECTURE.md#19-performance-strategy)
