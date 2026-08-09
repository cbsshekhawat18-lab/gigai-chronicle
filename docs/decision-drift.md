# Decision Drift & Health

Architecture decisions age and can quietly contradict the code. Chronicle
**reports** this — it never rewrites a decision automatically.

## `chronicle drift`

Flags an active decision whose subject later saw work naming a *different*
technology — a signal the decision may have been quietly replaced.

```
DECISION DRIFT
⚠ likely: let's use REST for the API
   evidence: later work mentions graphql on the same subject (decision names rest)
```

Confidence is labeled `possible` (one contradicting item) or `likely` (two or more).
Evidence and provenance are always shown. Resolution — if offered — never deletes
history; the original decision remains as a superseded record.

## `chronicle decisions` (decision health)

Health of every active decision:

```
DECISION HEALTH
  active: 27  healthy: 19  aging: 4  stale: 3  conflicting: 1
  [stale] Authentication architecture  (age 184d)
  [conflicting] Storage architecture   (age 141d)
```

- **aging** > 90 days · **stale** > 180 days · **conflicting** = involved in an
  unresolved Project-Memory decision conflict.
- `relatedChanges` counts the events tied to the decision.

Both commands support `--json`. They turn Project Memory from a passive store into
an actively-maintained one — surfacing what to review, with evidence, never guessing.
