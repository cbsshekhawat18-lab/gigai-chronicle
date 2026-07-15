# @gigaichronicle/core

The Chronicle engine. Landed so far:

## Chronicle Store layer 1 — `EventLog` (M3)

Exactly three log operations, forever ([ARCHITECTURE §8](../../docs/ARCHITECTURE.md#8-chronicle-store-storage-engine)):

```ts
import { EventLog } from "@gigaichronicle/core";

const log = await EventLog.open("/repo/.chronicle", { workspaceId });
await log.append(events); //          validate → route → spill → O(1) line write
for await (const { event } of log.scan({ session })) { … }
const report = await log.verify(); // heal torn tails, report (never rewrite) corruption
await log.close(); //                 lifecycle: flush + release locks
```

Guarantees (all test-enforced):

- **Append is O(1)** — cached handle, one buffered write per event; fsync on
  close + periodic timer, never on the hot path (p99 budget: 5ms, asserted
  against [perf/budgets.json](../../perf/budgets.json)).
- **Crash-safe** — a `SIGKILL` mid-append leaves at most one torn trailing
  line; `verify()` truncates it and records the loss as a `CaptureGap` on the
  same stream. Property-tested at every truncation offset, plus a real
  child-process kill test.
- **Structurally conflict-free** — stream routing per
  [ADR-0007](../../docs/adr/0007-store-stream-layout.md) (session / ambient /
  ops streams, single-writer filenames); proven by a real two-branch git
  merge fixture (risk R7).
- **Nothing invalid is ever written** — every event is spec-validated before
  the write (`E_INVALID_EVENT`); every stored line is `cat`+`jq` readable.
- **Blob spill** — >64KB top-level string payload fields go to
  content-addressed `blobs/sha256-*.md` sidecars; `readBlob` verifies the
  hash on the way back.
- **Advisory locks** — one writer per stream per machine
  (`.local/locks/`, `E_LOCKED`); stale locks from dead pids are reclaimed.

## Chronicle Store layer 2 — `ChronicleIndex` + `runDoctor` (M4)

Disposable SQLite cache (better-sqlite3, ADR-0008, lazy-loaded): WAL + FTS5,
incremental per-stream cursors, rebuild as the only migration. Queries:
`timeline / sessions / search / commitLinks`. `runDoctor`: verify+heal,
freshness, `--scan-secrets` (kinds/locations, never content), provable
zero-egress verdict.

## The Event Engine — the only door (M5)

```ts
import { EventEngine } from "@gigaichronicle/core/emit"; // providers: THIS surface only

const engine = await EventEngine.open(chronicleDir, { workspaceId, provider });
await engine.emit({ type: "PromptSubmitted", session, payload: { text } });
```

validate → **redact (before first write)** → enrich → normalize. Malformed
candidates become CaptureGaps — `emit()` never throws into a provider.
Redaction: pattern pack + workspace .env harvest + conservative entropy
heuristic → irreversible `[REDACTED:kind:hash8]` markers. See
[docs/privacy.md](../../docs/privacy.md).

Coming next: Replay Engine (M8), correlation (M9).
