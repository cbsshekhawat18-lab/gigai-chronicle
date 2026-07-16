---
"@gigaichronicle/core": minor
"@gigaichronicle/cli": minor
"@gigaichronicle/provider-claude-code": minor
"gigaichronicle-vscode": minor
---

AI identity everywhere + timeline redesign (founder feedback). Capture:
transcript parser and Stop-hook tail extract the answering model
(`actor.model`); incremental imports no longer re-emit SessionStarted (the
title-wipe bug). Index v2: provider/model columns + filters; per-session
provider/model badge aggregation; session start derived from first recorded
moment; version check precedes DDL so old index files upgrade by rebuild
instead of erroring. CLI: `chronicle sessions` with provider/model badges
and `--provider/--model` filters (also on timeline); first-prompt label
fallback. Extension: human session names (never raw ids), relative times,
provider filter chips, chat-bubble replay with grouped collapsible tool
runs, git-style commit milestones, day separators, sticky session header,
brand-accented theme-aware styling.
