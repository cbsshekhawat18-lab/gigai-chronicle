# Design references

Non-binding UI sketches that inform the [roadmap](../ROADMAP.md). These are
*targets*, not specs — the ReplayFrame model and the design laws in
[ARCHITECTURE.md](../ARCHITECTURE.md) are what actually constrain the build.

## Dashboard mockup (v0.2)

The single, local, read-only workspace. Text rendering of the target layout:

```
┌ GIGAI CHRONICLE ─────┬──────────────────────────────────────────────────┐
│                      │ ok, do and make product launch ready             │
│ CHRONICLE          ▾ │ Claude Code · claude-opus-4-8 · 30 turns ·        │
│  ◷ Timeline          │ 95 tool runs · fidelity full                     │
│  ◔ Sessions          │ ┌──────────┬───────┬─────┬───────┬──────┐        │
│  ▷ Prompts           │ │Conversat.│ Tools │ Git │ Files │ Gaps │        │
│  ⌥ Commits           │ └──────────┴───────┴─────┴───────┴──────┘        │
│  ▤ Files             │                                                  │
│  ▥ Knowledge         │ 15:29 ● YOU  [restore code]                      │
│  ⌕ Search            │         ok, do and make product launch ready     │
│  ⚙ Settings          │ 15:29 ● tool run — Bash                          │
│                      │ 15:30 ○ session started                          │
│ RECENT SESSIONS      │ 15:34 ◔ 12 tool runs — Bash×6 Read×3 Write Edit×3 │
│  ok, do and make …   │ 15:54 ┌ AGENT ──────────────────────────────┐    │
│  2h ago · 30 turns   │       │ Launch-ready. Here's the full picture│    │
│  Auth middleware …   │       │ ...                                  │    │
│  1d ago · 12 turns   │       │ Files changed 18   Tokens used 24.1k │    │
│  Refactor service …  │       └──────────────────────────────────────┘    │
│  View all sessions   │                                                  │
└──────────────────────┴──────────────────────────────────────────────────┘
```

**What each piece reads from (no new data is invented):**

| UI element | Source |
|---|---|
| Model badge, turns, tool runs, files touched, fidelity | ReplayFrame summary |
| Conversation / Tools / Git / Files tabs | Projections of the frame |
| **Gaps** tab | The fidelity model — missing capture, shown honestly |
| Files touched (session) | `workingSet` size |
| ~~Tokens used~~ | **Not shown** — Chronicle captures no token counts |
| Restore + Compare affordances | `refs/chronicle/ckpt/*` (ADR-0012) · captured prompts |

**Laws it must not break:** renders projections not raw provider data · fully
local · never calls a model · CSP-locked · no per-developer scoring · one
workspace (tabs, not a panel fleet — §15.2).
