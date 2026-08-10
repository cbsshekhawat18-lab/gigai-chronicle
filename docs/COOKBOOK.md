# Cookbook — real recipes

Practical workflows. Every command here exists today.

## Starting an existing project (new to you or a new AI)
```bash
chronicle bootstrap                    # full project state + rules + next step
```

## Starting a new feature safely
```bash
chronicle preflight "add payment webhook retries"
# review the risks/contradictions, then code
chronicle postflight                   # after coding: scope drift + new decisions
```

## Understanding a file before touching it
```bash
chronicle context src/payment/webhook.ts   # why it looks the way it does
chronicle why-not src/payment/webhook.ts   # what NOT to change here
chronicle risk src/payment/webhook.ts      # explainable risk score
chronicle impact src/payment/webhook.ts    # what else this may affect
```

## Avoiding a repeated mistake
```bash
chronicle repeat --task "authentication"   # has this problem recurred before?
```

## Checking the project's state
```bash
chronicle health            # overall development health + warnings
chronicle unfinished        # work started but not completed
chronicle stuck             # tasks that appear stalled
chronicle debt              # technical debt (with provenance)
chronicle drift             # decisions the code may have outgrown
```

## Task-scoped AI context (don't dump the whole repo)
```bash
chronicle project context --task "fix the refresh-token race condition" --budget 4000
```

## Switching AI models mid-project
```bash
# with model A's work captured, open the repo with model B and:
chronicle bootstrap
chronicle project context --task "continue the authentication work"
```

## End of day → next day
```bash
chronicle handoff           # records a handoff into memory
# next day:
chronicle continue          # ready-to-paste continuation prompt
```

## Is the project ready for a new AI?
```bash
chronicle onboarding-test   # readiness score + specific gaps
chronicle memory-health     # coverage + recommendations
```

## Set up AI instruction files (so agents self-serve)
```bash
chronicle agents init       # writes AGENTS.md / CLAUDE.md / GEMINI.md (never clobbers)
```

## Keep memory current
```bash
chronicle memory rebuild    # re-derive after significant work (idempotent)
chronicle memory verify     # integrity + secret-leakage check
```

## Trust checks
```bash
chronicle doctor            # zero-network proof, secret audit, integrity
```

Tip: append `--json` to feed any of these to an agent or a script.
