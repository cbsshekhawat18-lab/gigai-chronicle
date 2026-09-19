---
"gigai-chronicle": minor
---

`chronicle init` now starts capture. Initializing a project wires the Claude
Code hooks into `.claude/settings.json` in the same command — the second step
(`chronicle hooks install claude-code`) was the one nobody ran, and skipping it
produced a project that looked initialized, reported `capture claude-code:auto`,
and recorded nothing. Hooks are installed only for a detected tool, skipped when
user-scope hooks already cover the repo (double hooks = double events), opt-out
with `--no-hooks`, and `.claude/settings.json` is listed in init's footprint.

`chronicle status` gained a `hooks` line that reports the wiring rather than the
intent: `NOT INSTALLED — nothing is being recorded` when capture is silently off.
