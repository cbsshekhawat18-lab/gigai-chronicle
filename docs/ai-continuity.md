# AI Continuity

The payoff of [Project Memory](project-memory.md): **any AI agent can enter a
Chronicle-enabled project and continue where the last one stopped — without the
developer re-explaining anything, and regardless of which model wrote the earlier
work.**

```
Day 1  Claude Code works  → Chronicle captures the journey
Day 2  Codex opens repo   → chronicle bootstrap → understands prior work
Day 3  Gemini opens repo  → chronicle bootstrap → continues from where Codex stopped
```

This is **provider-independent**: every agent's output is normalized to Chronicle
events, and memory is derived from those events — never from a Claude/Codex/Gemini-
specific format.

## The three commands

```
chronicle bootstrap     # onboard a NEW agent: rules + full current state + next step
chronicle continue      # a ready-to-paste "pick up where we left off" prompt
chronicle handoff       # end-of-session record, PERSISTED into memory for the next agent
```

All support `--copy` (clipboard), `--json`, and the Context-Engine scope flags
(`--task`, `--file`, `--budget`, `--since`, `--compact`/`--full`).

- **bootstrap** leads with standing rules ("you are NOT starting from scratch;
  respect active decisions; do not repeat failed approaches; verify against the
  code"), then the current project state, then a recommended next step.
- **continue** is a shorter, paste-ready continuation prompt ending in "start by
  explaining your implementation plan."
- **handoff** renders Objective / Completed / In Progress / Next / Decisions /
  Constraints / Known Issues / Failed Approaches / TODOs, and stores itself as a
  `handoff` memory item so the next agent inherits it.

## AI instruction files

```
chronicle agents init [--force]
```

Writes small, provider-neutral **AGENTS.md / CLAUDE.md / GEMINI.md** that point
whatever agent opens the repo at `bootstrap` / `project context` / `context` /
`handoff`. They stay tiny (they *point at* the commands, they don't inline the
memory, which would go stale). Existing user-authored files are never overwritten
without `--force`.

## In the editor (VS Code / Cursor / Windsurf)

- **Project Memory** panel in the dashboard: Current Work + counts (active
  decisions, constraints, TODOs, known issues, failed approaches, handoffs) with
  one-click buttons.
- Commands: **Prepare AI Context**, **Continue Previous Work**, **Create
  Handoff**, **Search Project Memory** — each copies to the clipboard and offers
  a Markdown preview.

## The golden test (definition of done)

A developer works 20 sessions with Claude Code, then opens the repo with Codex,
which has seen none of the conversations. `chronicle bootstrap` tells Codex: the
active decisions (e.g. PostgreSQL for session state, JWT for auth), the
constraints, the known issues, the previously **failed/superseded** approaches
(e.g. Redis was considered and dropped — *do not repeat*), the requested features
(e.g. refresh tokens), the unfinished work (the race condition), and the
recommended next step — each traceable to its source event. This scenario is
covered by `packages/core/test/memory-context.test.ts`.

## MCP (deferred)

The spec's MCP surface is **conditional on Chronicle already exposing MCP**, and
today it does not. Rather than bolt on a server uninvited, MCP is a deliberate
deferral; the same read-only capabilities are available now via
`chronicle … --json` (stable, versioned envelopes), which an agent harness can
call directly. An MCP wrapper over these is a clean future addition.

See also: [project-memory.md](project-memory.md), [context-engine.md](context-engine.md).
