# 0007 — Store stream layout: ambient streams, ops streams, spill scope

- Status: Accepted
- Date: 2026-07-15
- Relates: [ARCHITECTURE.md §7.2](../ARCHITECTURE.md#7-on-disk-format-the-chronicle-spec), §8; milestone M3

## Context

Three storage details are implied but not pinned by ARCHITECTURE v2, and M3
cannot ship without settling them:

1. **Where do shared events without a session live?** The dir spec shows only
   `ses_*.jsonl` under `sessions/`, but the taxonomy has shared events with
   optional or no session binding (`ProjectCreated`, ambient git moments,
   `LinkConfirmed/Rejected`, sessionless `CaptureGap`).
2. **What is the exact `.local/ops/` stream layout** for local-visibility
   events (§5.4 names the directory only)?
3. **What exactly spills at 64KB** (§7.2 rule 5 says "payloads", the schema
   defines blob refs on text-typed fields)?

## Decision

1. **Ambient streams.** Shared events without a session are appended to a
   per-workspace monthly stream `sessions/YYYY/MM/amb_<workspace-ulid>.jsonl`
   (month from the event's `ts`). The filename embeds the originating
   workspace's entropy, so the single-writer law (design law 6) holds
   structurally — two machines never write the same ambient file.
   *Rejected:* a shared `project.jsonl` (shared-mutable file — violates law
   6); synthetic "ambient sessions" (distorts the data model).
2. **Ops streams.** Local-visibility events go to
   `.local/ops/YYYY/MM/ops.jsonl` (month from `ts`). `.local/` is
   machine-private and never committed, so one machine is the only writer;
   same-machine processes serialize via the advisory locks in
   `.local/locks/`.
3. **Spill scope.** At append time, any **top-level string payload field**
   whose UTF-8 length exceeds 64KB (fixed constant, ADR-0005) is written to
   `<stream-dir>/blobs/sha256-<hash of content>.md` and replaced by
   `{ "$blob": "sha256-<hash>" }`. If the replacement would make the event
   schema-invalid (the field is not text-or-blob typed), the field stays
   inline: **big-but-valid beats small-but-invalid.** Blob files contain the
   raw content bytes, nothing else — content addressing is the integrity
   check.

## Consequences

- Every stream file remains single-writer by construction; the R7 two-branch
  merge fixture covers session + ambient files.
- `verify()` heals torn tails on all three stream kinds and records the loss
  as a `CaptureGap` routed by the same rules (a session-stream gap binds to
  its session).
- These rules are Spec v1 surface — added to the schema package README table
  of store rules and to the conformance corpus over time.
