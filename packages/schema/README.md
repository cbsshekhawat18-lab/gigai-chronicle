# @gigaichronicle/schema — Chronicle Spec v1 (draft 0)

The executable contract of the [Chronicle open specification](../../docs/SPEC-ROADMAP.md):
the **ChronicleEvent** envelope, the Phase-1 core event taxonomy, prefixed-ULID
identifiers, and the `.chronicle/config.json` schema. Zod definitions are the
source of truth; the language-neutral artifacts in [`schemas/`](schemas/) are
generated from them at build time (drift-guarded by test), and
[`fixtures/`](fixtures/) seeds the public conformance corpus.

Runtime dependencies: **zod only**. No Node-only APIs. Nothing vendor-specific
in schema structure (test-enforced — examples below use `example-tool`).

## The envelope

Every event, from every provider, in every phase ([ARCHITECTURE.md §5.2](../../docs/ARCHITECTURE.md#5-the-chronicleevent-model)):

```json
{
  "v": 1,
  "id": "evt_01ARZ3NDEKTSV4RRFFQ69G5FA0",
  "ts": "2026-07-14T10:32:11.412Z",
  "type": "PromptSubmitted",
  "session": "ses_01ARZ3NDEKTSV4RRFFQ69G5FD4",
  "actor": { "kind": "human" },
  "git": { "head": "9fc1b2a", "branch": "feat/auth", "dirty": ["src/auth.ts"] },
  "payload": { "text": "Add refresh-token rotation to the auth middleware" },
  "meta": {
    "provider": "example-tool@1.0.0",
    "workspace": "wks_01ARZ3NDEKTSV4RRFFQ69G5FD5",
    "schema": "PromptSubmitted/1",
    "visibility": "shared"
  }
}
```

Normative rules:

- **Timestamps** are UTC ISO-8601 with millisecond precision and `Z` suffix —
  one canonical form, byte-comparable.
- **IDs** are prefixed ULIDs (`evt_ ses_ prj_ wks_ prm_ dec_ req_ bmk_`),
  26-char Crockford base32, time-sortable, coordination-free. Ordering within
  a session file is append order, not ID comparison.
- **Read-forward** ([§22](../../docs/ARCHITECTURE.md#22-versioning-compatibility-spec-governance)):
  unknown fields anywhere are preserved, never rejected. `v` greater than
  known → `SCHEMA_AHEAD` (a distinct verdict from `INVALID`). A core payload
  version greater than known is tolerated: envelope validates, payload
  validation is skipped rather than wrongly failed.
- **`meta.schema`** is `<TypeName>/<payloadVersion>` and must reference the
  event's own type.
- **Text bodies** are `string` or a blob reference
  `{ "$blob": "sha256-<64 hex>" }` once they exceed the 64KB inline limit
  (spill is store behavior, §7.2 rule 5; the reference shape is spec).
- **Visibility**: `shared` (committed journey) vs `local` (machine-local ops
  stream, §5.4).

## Core taxonomy (Phase 1 — 20 types)

| Type | Session binding | Default visibility | Payload (v1) |
|---|---|---|---|
| `ProjectCreated` | none | shared | `projectId`, `name` |
| `ProjectOpened` | none | **local** | `{}` (throttled ≤1/day/workspace by the engine) |
| `SessionStarted` | required | shared | `title`, `resumedFrom` |
| `SessionEnded` | required | shared | `reason: completed\|interrupted\|unknown` |
| `PromptSubmitted` | required | shared | `text` |
| `PromptEdited` | required | shared | `text`, `revises` |
| `AIResponseReceived` | required | shared | `text`, `inResponseTo` |
| `ToolExecuted` | required | shared | `tool`, `outcome`, `summary`, `durationMs` |
| `FileModified` | required | shared | `paths[]` (coalesced batches) |
| `FilesAccepted` / `FilesRejected` | required | shared | `paths[]`, `responseEvent` |
| `GitCommitCreated` | optional | shared | `sha`, `subject`, `branch` |
| `GitPush` | optional | shared | `remote`, `branch` |
| `BranchChanged` | optional | shared | `from`, `to` |
| `GitTagCreated` | optional | shared | `tag`, `sha` |
| `LinkConfirmed` / `LinkRejected` | optional | shared | `commit`, `session` |
| `CaptureGap` | optional | **shared** (gaps are part of the record) | `reason`, `detail` |
| `CaptureDegraded` | optional | **local** | `provider`, `fromTier`, `toTier`, `reason` |
| `WorkspaceMoved` | none | **local** | `fromPath`, `toPath` |

Session binding semantics — a spec-level precision of §5.3: **required**
(only meaningful inside a session), **optional** (ambient — git moments occur
with or without a session), **none** (project-scoped; a session reference is
an error).

Reserved for later phases (using them today is `UNKNOWN_TYPE`):
`KnowledgeExtracted`, `BenchmarkExecuted`, `RegressionExecuted`,
`DeploymentDetected`.

**Extension events** — `Ext.<provider-id>.<EventName>`
(e.g. `Ext.example-tool.SubagentStarted`): provider id lowercase-kebab, name
PascalCase. Payload opaque at spec level; schemas register at provider
activation. Nothing downstream may depend on them.

## API

```ts
import {
  parseChronicleEvent, // (unknown) → { ok, event, kind } | { ok:false, code, message }
  parseChronicleEventLine, // JSONL convenience
  newId, isId, idTime, // prefixed ULIDs
  CORE_EVENTS, CORE_EVENT_TYPES, // the registry (taxonomy as data)
  envelopeSchema, configSchema, // zod schemas
} from "@gigaichronicle/schema";
```

Parse verdicts: `SCHEMA_AHEAD` · `UNKNOWN_TYPE` · `INVALID` — never an
exception on data.

## Conformance corpus

[`fixtures/`](fixtures/): one valid + one invalid envelope per core type,
plus forward-compat cases with recorded expectations
(`forward-compat/expectations.json`). A third-party implementation is
conformant when it reproduces these verdicts ([SPEC-ROADMAP.md §3](../../docs/SPEC-ROADMAP.md)).
