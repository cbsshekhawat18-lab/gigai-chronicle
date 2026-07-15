# 0004 — Replay before Timeline in the build order

- Status: Accepted
- Date: 2026-07-15 (decision 2026-07-14)
- Ratifies: decision **D9** ([ARCHITECTURE.md §24](../ARCHITECTURE.md#24-decision-log-resolved--newly-open))

## Context

v1 ordered capture → storage → timeline. The v2 review found the timeline is
a visualization while replay is the capability, and that a timeline built on
raw events would hide capture inadequacy behind pixels
([ARCHITECTURE.md §10.2](../ARCHITECTURE.md#10-replay-engine)).

## Decision

Build order is **Capture → Storage → Replay → Timeline → Knowledge →
Analytics**. The MVP gate (M8) is an *outside developer's* recorded reaction
to `chronicle replay` **in the terminal** — M9/M10 are blocked until it
passes. Design law 5 applies: a provider is complete only when its sessions
replay at declared fidelity.

## Consequences

- Digests, timeline, inspect, knowledge, and reports are all replay-frame
  consumers — one reconstruction implementation, many renderers.
- Replay determinism (pure function of the event stream) becomes a spec
  requirement (Spec v3) with golden-frame conformance fixtures.
