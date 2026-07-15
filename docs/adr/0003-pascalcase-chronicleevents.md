# 0003 — PascalCase ChronicleEvent taxonomy

- Status: Accepted
- Date: 2026-07-15 (decision 2026-07-14)
- Ratifies: decision **D8** ([ARCHITECTURE.md §24](../ARCHITECTURE.md#24-decision-log-resolved--newly-open))

## Context

v1 used dot-namespaced lowercase types (`prompt.submitted`). The v2 revision
made ChronicleEvent the single first-class model and required names that read
as provider-neutral journey verbs, with tool-specific moments quarantined.

## Decision

Core event types are **PascalCase journey verbs** (`PromptSubmitted`,
`AIResponseReceived`, `FilesAccepted`, `GitCommitCreated`, …) per
[ARCHITECTURE.md §5.3](../ARCHITECTURE.md#5-the-chronicleevent-model).
Provider/plugin-specific events live only under **`Ext.<providerId>.<Name>`**
with schemas registered at activation; nothing downstream may depend on them.

## Consequences

- One vocabulary downstream of the Event Engine; `meta.schema` versions each
  payload (`PromptSubmitted/1`) so evolution is additive.
- M2 implements the taxonomy exactly as tabled in §5.3; any deviation needs a
  superseding ADR first.
