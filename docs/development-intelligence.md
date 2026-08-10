# Development Intelligence

Chronicle records the AI development journey; **Development Intelligence understands
it.** It answers the questions Git, chat history, and generic AI memory cannot:

> Why are we doing this? · What have we already tried? · What should I NOT change? ·
> What's risky here? · What will this affect? · Are we repeating a mistake? · Did we
> actually finish? · What debt did we create? · Which decisions are going stale? ·
> Where is development stuck? · Is this project ready for a new AI?

It's a layer **on top of** the event history + [Project Memory](project-memory.md)
+ git — it never replaces them.

```
Git ─ what changed?
      │
Chronicle events ─ what was asked?
      │
Project Memory ─ what do we know?
      │
Development Intelligence ─ Risk · Decisions · Work · Impact · Health
      │
Developer insight / AI context
```

## Non-negotiable rules

- **Deterministic & model-free.** No LLM, no network, no embeddings, no vector DB.
- **Explainable.** Every score is a *sum of named signals*, each with a weight and
  provenance. There is no opaque number.
- **No false certainty.** Findings are *detected / likely / possible / confirmed* —
  never "this will break". Recommendations, not verdicts of fact.
- **Private.** Local sessions never influence shared intelligence; everything flows
  through the existing redaction. Fast: incremental, index-backed, lazy.

## Commands (all support `--json`)

| Command | Answers |
|---|---|
| `chronicle risk <file>` | how risky is this file? (explainable) — [risk-engine.md](risk-engine.md) |
| `chronicle why-not <file>` | what should I NOT change, and why? — [negative-knowledge.md](negative-knowledge.md) |
| `chronicle impact <file>` | what will this change affect? (co-change radar) |
| `chronicle repeat` | are we repeating a previous mistake? |
| `chronicle preflight "<task>"` | can I safely make this change? — [preflight-postflight.md](preflight-postflight.md) |
| `chronicle postflight` | what did this change actually do? |
| `chronicle scope` | did the AI change more than asked? |
| `chronicle drift` / `chronicle decisions` | which decisions are going stale/conflicting? — [decision-drift.md](decision-drift.md) |
| `chronicle unfinished` / `chronicle stuck` | what's incomplete / stalled? |
| `chronicle debt` | what technical debt did we create? |
| `chronicle learnings` / `chronicle thinking <task>` / `chronicle story` | what did we learn / how did thinking evolve / the narrative |
| `chronicle heatmap` / `chronicle graph` | where is activity concentrated / how things connect |
| `chronicle health` / `chronicle dna` | project development health / this repo's profile |
| `chronicle memory-health` / `chronicle onboarding-test` | can a NEW AI understand this project? |

Also grouped under `chronicle intelligence <action>`. In VS Code/Cursor/Windsurf:
a **Development Intelligence** dashboard panel + the **Pre-flight**, **Why NOT**, and
**Risk** commands (right-click a file).

## How the signals are built

`collectFileEvidence` gathers deterministic evidence for a file: the captured
prompts that changed it (checkpoint attribution), how much (churn), in which
sessions, and the Project Memory from those sessions. Risk/why-not/impact explain
themselves from that. Repeat/stuck group problem-phrased prompts by subject across
sessions. Health/DNA/onboarding compose the other engines into bounded, labeled
sub-metrics.

## The workflow

```
Developer → chronicle preflight "<task>"   (context + risks + history + decisions)
         → AI writes code
         → chronicle postflight            (scope + new decisions + concerns)
         → Project Memory updates          (chronicle memory rebuild)
         → next developer / next AI
```

The goal is not to make AI remember more — it's to make the development process
smarter, with every insight explainable and traceable to the record.
