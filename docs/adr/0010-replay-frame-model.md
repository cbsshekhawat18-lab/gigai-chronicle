# 0010 — ReplayFrame model & determinism rules

- Status: Accepted
- Date: 2026-07-15
- Relates: [ARCHITECTURE.md §10](../ARCHITECTURE.md#10-replay-engine); milestone M8. **Spec v3 surface.**

## Context

§10.1 sketches the frame; implementation needs the exact reduction semantics
third-party replayers must reproduce.

## Decision

**Reduction.** `replaySession(events)` is a pure left-fold over one session's
events **in stream-file order** (append order — the store's canonical
ordering; IDs and timestamps are display data, never sort keys). Frame *i*
is the state after event *i*:

| Event | Effect on frame |
|---|---|
| `SessionStarted` | `title`, `startedTs` |
| `PromptSubmitted` / `PromptEdited` | append `conversation ← {role:"human", text, eventId, ts}` |
| `AIResponseReceived` | append `conversation ← {role:"agent", text, eventId, ts}` (text may be a `$blob` ref — renderers resolve, the engine never does I/O) |
| `ToolExecuted` | append `tools ← {tool, outcome, summary, eventId, ts}` |
| `FileModified` | upsert `workingSet[path].status = "modified"` |
| `FilesAccepted` / `FilesRejected` | upsert status `"accepted"` / `"rejected"` |
| `GitCommitCreated` | append `git.commits`; update `git.head` |
| `BranchChanged` | update `git.branch` |
| `CaptureGap` | append `gaps ← {reason, detail, eventId}` |
| `SessionEnded` | `endedTs`, `endedReason` |
| `Ext.*` and other core types | **no frame effect** — opaque timeline entries (§5.3) |

**Fidelity** (honest ceiling, not marketing): `lossy` when any contributing
event's provider is `manual`/`wrap`; else `partial` when `gaps` is
non-empty; else `full`.

**Determinism rules (normative).** Replay is a pure function of the event
array: no wall-clock, no randomness, no filesystem/network/model calls, no
re-execution, input never mutated. Same events → byte-identical frames on
any machine and in any conformant implementation. Gaps must SURFACE
(`gaps[]` + fidelity), never be interpolated across.

**Digests are frame renderings.** The session digest (`ses_*.md`) is a
markdown rendering of the FINAL frame plus counts — one reconstruction
implementation, many renderers (§10.1). Digests carry the generated-file
marker and regenerate idempotently.

## Consequences

- Golden-frame fixtures (literal envelopes → snapshot frames) become the
  Spec v3 conformance seeds.
- `frameAt(events, index)` is exact-by-construction; checkpointing is an
  implementation optimization, never a semantic.
