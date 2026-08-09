# Why Chronicle?

## The problem

AI-assisted development loses its own history. The conversation that produced
the code — the decisions, the rejected approaches, the reasoning — lives in a
chat window that closes.

```
Developer → AI → chat → code → git
```

What git keeps: *what changed*. What it doesn't keep: *what was asked, why, what
was tried and rejected, and what's still true.* So:

- The next session (or the next AI model) starts from zero — you re-explain the
  project every time.
- Decisions are forgotten; **failed approaches get retried**.
- Architectural reasoning disappears.
- Technical debt and unfinished work stay invisible.

## What Chronicle adds

```
Developer → AI → CHRONICLE → Project Memory → Development Intelligence → git
```

- **Chronicle Core** records the journey — prompts, responses, tools, changes —
  as plain text inside your repo, linked to git.
- **Project Memory** distills that into what the project *knows*: decisions,
  constraints, known issues, failed approaches — each traceable to its source.
- **AI Continuity** lets any agent (Claude, Codex, Gemini, Cursor…) pick up where
  the last one stopped, no re-explaining.
- **Development Intelligence** reads the journey for risk, repeated mistakes,
  decision drift, scope drift, debt, and health — with explainable signals.
- **Context Engine** hands an AI exactly the relevant slice, not the whole repo.

## Without vs with

| | Without Chronicle | With Chronicle |
|---|---|---|
| New AI joins | starts from zero, you re-explain | `chronicle bootstrap` → understands the project |
| Before a change | hope it's safe | `chronicle preflight` → risks, contradictions, history |
| A rejected idea returns | quietly retried | `chronicle why-not` → "already rejected, don't reintroduce" |
| Reasoning | in a closed chat | in Project Memory, with provenance |
| Handoff | a paragraph from memory | `chronicle handoff` → complete, sourced |

## What Chronicle is *not*

Not a chatbot, not a RAG system, not a prompt manager, not a Git UI, not an AI
coding assistant. It sits **alongside** your tools and preserves the development
journey — local-first, model-independent, and it never calls a model.

> Git remembers *what changed*. Chronicle remembers *what happened, why, and what
> the project now knows* — and helps you make safer changes.
