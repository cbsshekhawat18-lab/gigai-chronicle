# Pre-flight & Post-flight

The bookends of a safe AI change. **Pre-flight** answers *"can I safely make this
change?"* before code is written; **post-flight** answers *"what did this change
actually do?"* after. Both are deterministic and explainable.

## `chronicle preflight "<task>"`

Combines Project Memory + previous attempts + risk into one briefing:

- **Contradictions** — the task reintroduces a rejected approach, or (for a
  change/replace/migrate verb) reverses an active decision.
- **Previous attempts** — unresolved repeated problems matching the task.
- **Active decisions & constraints** relevant to the task.
- **Known risks**, **affected areas**, **suggested tests**.
- **Verdict** — `proceed` / `review` / `caution`.

```
# Chronicle Pre-flight
## Task
Replace Redis with PostgreSQL for session storage
## Risk: HIGH
## Potential contradictions
- ⚠ Already tried and rejected — the task may reintroduce it: instead of Redis, use PostgreSQL for sessions
- ⚠ This may reverse an active decision: let's keep session state in PostgreSQL
## Verdict
⚠ REVIEW BEFORE IMPLEMENTING
```

The markdown doubles as compact AI context (paste it before the task). `--json`
returns `{ task, verdict, riskLevel, contradictions, previousAttempts, … }`.

## `chronicle postflight`

Analyzes the latest session:

- **Changed files** (attribution) and **scope drift** (files outside the task's
  keyword area — `chronicle scope` standalone).
- **New decisions / TODOs** the work introduced.
- **Concerns** (e.g. changed files outside scope) and a **status** (`ok`/`review`).

## AI integration (opt-in, future)

The intended loop is `AI task starts → preflight → context; AI task finishes →
postflight → memory update`. This is designed to be opt-in, configurable, local,
and non-blocking; today the commands are invoked explicitly (CLI, VS Code, or an
agent via `--json`). Nothing runs automatically without configuration.

In the editor: **Chronicle: Pre-flight a change** (Command Palette / Development
Intelligence panel).
