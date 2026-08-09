# What can Chronicle do?

Every capability in plain English, with the command and when to reach for it.
All are local, deterministic, and model-free (Chronicle never calls a model).

## Chronicle Core — *understand what happened*

| Command | What it does | Use it when |
|---|---|---|
| `chronicle why <file>` | the prompts that shaped a file | "why is this code like this?" |
| `chronicle restore <event>` | put the tree back to any prompt | an AI detour went wrong |
| `chronicle replay <session>` | step through a session | reviewing AI-heavy work |
| `chronicle timeline` / `sessions` | the journey, with model badges | seeing what happened |
| `chronicle diff` | wording delta between two prompts | how your ask changed |
| `chronicle prompt …` | a versioned prompt library | keep a prompt that worked |
| `chronicle knowledge` | decisions & TODOs from history | a quick index of the record |
| `chronicle import` / `hooks` | backfill / live capture | onboarding an existing repo |
| `chronicle doctor` | integrity + secret audit + zero-egress proof | trust checks |

## Project Memory — *remember what the project knows*

| Command | What it does |
|---|---|
| `chronicle memory rebuild` | derive memory from the event history (idempotent) |
| `chronicle memory list / search / show` | browse decisions, constraints, issues, TODOs, failed approaches… |
| `chronicle memory verify` | schema + provenance + secret-leakage + reference checks |
| `chronicle memory conflicts` | unresolved decision standoffs |
| `chronicle memory stats` | local diagnostics |

Use it when a new developer or AI needs to understand the project. See
[project-memory.md](project-memory.md).

## AI Continuity — *continue across sessions and models*

| Command | What it does |
|---|---|
| `chronicle bootstrap` | onboard a brand-new agent (state + rules + next step) |
| `chronicle project context --task/--file` | a task/file-scoped briefing |
| `chronicle continue` | a ready-to-paste continuation prompt |
| `chronicle handoff` | an end-of-session record, saved for the next agent |
| `chronicle agents init` | write AGENTS.md / CLAUDE.md / GEMINI.md |

Use it when you switch from Claude to Codex/Gemini/Cursor, or resume tomorrow.
See [ai-continuity.md](ai-continuity.md).

## Development Intelligence — *make safer decisions*

| Command | Answers |
|---|---|
| `chronicle preflight "<task>"` | can I safely make this change? |
| `chronicle postflight` / `scope` | what did this change actually do? / scope drift |
| `chronicle risk <file>` | how risky is this file? (explainable) |
| `chronicle why-not <file>` | what should I NOT change, and why? |
| `chronicle impact <file>` | what will this change affect? |
| `chronicle repeat` / `stuck` / `unfinished` | are we repeating a mistake / stalled / incomplete? |
| `chronicle drift` / `decisions` | which decisions are going stale/conflicting? |
| `chronicle debt` / `learnings` / `thinking` / `story` | debt / lessons / how thinking evolved / the narrative |
| `chronicle heatmap` / `graph` | where activity concentrates / how things connect |
| `chronicle health` / `dna` | project health / this repo's development profile |
| `chronicle memory-health` / `chronicle onboarding-test` | can a new AI understand this project? |

Use it before/after changes and for project oversight. See
[development-intelligence.md](development-intelligence.md).

## Context Engine — *the right context, not the whole repo*

`chronicle project context` and `chronicle context <file>` assemble a focused,
budgeted brief (rank → filter current-vs-superseded → fit a token budget) so you
don't dump the entire history into an AI. See [context-engine.md](context-engine.md).

---

Every command supports `--json` (stable, versioned envelope). The VS Code /
Cursor / Windsurf extension surfaces the same via **Project Memory** and
**Development Intelligence** dashboard panels + right-click file commands.
