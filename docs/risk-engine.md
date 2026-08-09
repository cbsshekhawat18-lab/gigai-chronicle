# Risk Engine

`chronicle risk <file>` produces an **explainable** 0–100 risk score. It is never
an opaque AI number — the score is the sum of named signals, each with a weight and
provenance, and it flags *where to look*, not a certainty.

## Signals

Derived from `collectFileEvidence` (captured prompts that changed the file, churn,
sessions, and the Project Memory from those sessions):

| Signal | Weight | Meaning |
|---|---|---|
| `prior-failures` | up to 40 | failed/superseded approaches in the file's sessions |
| `active-decision` | up to 30 | active architectural decisions/constraints depend on it |
| `known-issues` | up to 30 | unresolved known issues touch it |
| `high-change-frequency` / `change-frequency` | 12 / 6 | changed across many captured prompts |
| `high-churn` / `churn` | 12 / 6 | many lines changed over its history |

Score = capped sum. Level: **≥67 high · ≥34 medium · else low**.

## Example

```
RISK — src/auth/token.ts
  ████░░░░░░  36/100  MEDIUM

  Because:
  + [14] 1 previous failed/superseded approach(es) in this file's sessions
  + [10] 1 active architectural decision(s)/constraint(s) depend on this file
  + [12] 1 unresolved known issue(s) touch this file
```

## Honesty

A file with no captured history scores **unknown, not zero** ("risk is unknown, not
zero"). The note on every result restates that the score flags where to review, not
a prediction. `--json` returns `{ file, score, level, signals[] }` so an agent gets
the same explainable breakdown.
