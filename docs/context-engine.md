# Context Engine

The Context Engine turns [Project Memory](project-memory.md) into an **AI-ready
briefing** scoped to a task, a file, or the whole project — within a token
budget. It is deterministic and model-free.

```
Task / File / Project
      ↓
Candidate retrieval        (all memory items; persisted store, else derived)
      ↓
Relevance ranking          (task/file match · kind importance · status · recency · confidence)
      ↓
State filtering            (current vs superseded — stale is never shown as live)
      ↓
Context budgeting          (greedy fill to an approximate token budget)
      ↓
Paste-ready Markdown pack
```

## `chronicle project context`

```
chronicle project context
chronicle project context --task "fix the refresh-token bug"
chronicle project context --file src/payment/webhook.ts
chronicle project context --budget 4000        # ~tokens (compact 2k / default 8k / full 32k)
chronicle project context --since 7d            # ISO timestamp lower bound
chronicle project context --json
```

The pack is organized so the most important things come first: **Current Work →
Active Decisions → Constraints → Requirements → Architecture → Known Issues →
Next Steps → Failed/Superseded Approaches (do NOT repeat) → Recent Work.** Every
line carries a provenance ref back to the event it came from.

## Ranking

Each item is scored by:

1. **task relevance** — keyword overlap with `--task` (dominant when present)
2. **file relevance** — `--file` in the item's related files / content
3. **kind importance** — current work / constraints / decisions rank highest
4. **status** — `active` boosted; `superseded`/`rejected` demoted (but still
   shown, under the "do NOT repeat" heading)
5. **recency** and **confidence**

## Budgeting

Tokens are estimated at ~4 chars each. Items are added highest-relevance-first
until the budget is reached; at least one item always makes the cut. This is why
`--task` matters under a tight budget: the most relevant memory wins the space.

## File context — `chronicle context <file>`

`chronicle context <file>` (and the VS Code **Copy context pack** command) is the
file-scoped view. Beyond *what shaped the file* (the prompts, from checkpoint
attribution), it now explains **why the file looks the way it does**: the active
decisions, constraints, known issues, and failed/superseded approaches from the
sessions that shaped it. It prefers the state-aware Project Memory and falls
back to raw knowledge when memory hasn't been derived yet. Backward compatible.

See also: [project-memory.md](project-memory.md), [ai-continuity.md](ai-continuity.md).
