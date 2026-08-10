# Quick Start — 5 minutes

Gigai Chronicle records your AI-assisted development journey, turns it into
persistent **project memory**, and gives you **development intelligence** — all
local, plain-text, model-free.

## 1. Install

```bash
npm i -g gigai-chronicle              # the CLI (binary: `chronicle`)
```

And the editor extension: search **"Gigai Chronicle"** in VS Code / Cursor /
Windsurf (or Open VSX).

## 2. Initialize (in a git repo)

```bash
chronicle init                        # creates .chronicle/ (3 skippable questions)
chronicle hooks install claude-code   # capture live as you work
```

Already have history? Backfill it:

```bash
chronicle import claude-code          # or: chronicle import codex
```

## 3. Work normally

Every prompt, response, tool run, and code change is captured to `.chronicle/`.

## 4. Build the project's memory & intelligence

```bash
chronicle memory rebuild              # derive decisions/issues/TODOs from history
```

## 5. Use it

```bash
# Continuity — brief any AI agent (Claude, Codex, Gemini, Cursor…)
chronicle bootstrap                   # onboard a new agent to the whole project
chronicle project context --task "add payment retries"   # task-scoped briefing

# Before you change code — is it safe?
chronicle preflight "replace Redis with PostgreSQL"
chronicle why-not src/auth/token.ts   # what NOT to change here, and why
chronicle risk src/auth/token.ts      # explainable risk score

# Understand the project
chronicle health                      # project development health
chronicle onboarding-test             # can a new AI understand this project?
chronicle story                       # the development narrative

# End of session → next day
chronicle handoff                     # record a handoff for the next agent
chronicle continue                    # a ready-to-paste continuation prompt
```

Add `--json` to any command for machine-readable output.

## The whole loop

```
chronicle bootstrap            → a new AI understands the project
chronicle preflight "<task>"   → context + risks + history before coding
   … AI writes code …
chronicle postflight           → scope drift + new decisions after coding
chronicle handoff              → hand to the next session/agent
```

Next: [WHY-CHRONICLE.md](WHY-CHRONICLE.md) · [FEATURES.md](FEATURES.md) ·
[COOKBOOK.md](COOKBOOK.md) · [GUIDE.md](GUIDE.md) · [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
