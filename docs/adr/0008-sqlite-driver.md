# 0008 — SQLite driver: better-sqlite3 (node:sqlite as planned successor)

- Status: Accepted
- Date: 2026-07-15
- Relates: [ARCHITECTURE.md §8](../ARCHITECTURE.md#8-chronicle-store-storage-engine); milestone M4 (the classic OSS support-burden decision)

## Context

The index needs an embedded SQLite with FTS5 and WAL. Candidates:

| | `better-sqlite3` (native) | `node:sqlite` (built-in) | WASM (sql.js et al.) |
|---|---|---|---|
| Runtime deps | +1 native | **zero** | +1 (large) |
| Node 20 (current local floor) | ✅ | ❌ (22.5+) | ✅ |
| API fit | ✅ synchronous — ideal for an index | ✅ synchronous | ◐ |
| FTS5/WAL | ✅ | ✅ | ◐ build-dependent |
| Install burden | Prebuilds for all CI targets; ABI-mismatch issues are the known failure mode | none | none |
| Maturity at scale | ✅ years, huge deployments | experimental status/warnings on Node 22 | perf + persistence caveats |

## Decision

**better-sqlite3**, with its build script approved in `pnpm-workspace.yaml`
(`onlyBuiltDependencies`) and `@types/better-sqlite3` for typing. Loaded
**lazily** (inside `ChronicleIndex.open`) so store-only paths (append hot
path, hooks) never pay native-module startup.

**Planned successor:** `node:sqlite`, once the engines floor reaches a Node
line where it is stable (24 LTS). The swap is cheap *by architecture*: the
index is disposable and rebuild-only (no migrations exist), so a driver
change is a rebuild, not a data migration. Revisit when the engines floor
moves; supersede this ADR then.

## Consequences

- ABI-mismatch reports are the accepted support cost; mitigations: prebuilds
  cover the CI matrix; `chronicle doctor` failure mode for a broken index is
  always "delete + rebuild".
- Core runtime deps: zod (via schema) + better-sqlite3 — 2 of the <10 budget.
- The dependency stays **out of the CLI bundle** (external) and out of any
  non-index code path.
