# Negative Knowledge — `chronicle why-not`

`chronicle why` says what shaped a file. **`chronicle why-not <file>` says what
should NOT be changed, and why.** Negative knowledge — the things a team learned
*not* to do — is normally lost the moment a chat window closes. Chronicle preserves
it, with provenance. This is a core differentiator.

## What it surfaces

From the Project Memory of the sessions that shaped the file, ordered:

1. **Intentional decisions** — "This was an intentional decision — changing it may
   violate the design: …"
2. **Constraints** — "A constraint applies here: …"
3. **Failed / rejected approaches** — "Already tried and rejected — do NOT
   reintroduce: …"
4. **Unresolved issues** — "There is an unresolved issue in this area: …"

Plus the file's overall risk level (see [risk-engine.md](risk-engine.md)).

## Example

```
WHY NOT CHANGE THIS? — src/auth.ts

  1. This was an intentional decision — changing it may violate the design: let's keep session state in PostgreSQL
  2. Already tried and rejected — do NOT reintroduce: instead of Redis, use PostgreSQL for sessions
  3. There is an unresolved issue in this area: Fix the auth race condition

  Risk: MEDIUM
```

## Honesty

If nothing is recorded, it says so — *"no negative knowledge yet"* — and is explicit
that this does **not** mean the file is safe to change. Every reason traces to the
event that produced it (`--json` includes the provenance). In the editor: right-click
a file → **Chronicle: Why NOT change this file?**
