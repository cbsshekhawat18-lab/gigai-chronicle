---
"gigaichronicle-vscode": minor
"@gigaichronicle/provider-claude-code": minor
---

Chronicle starts itself. Opening a git project with no `.chronicle/` store no
longer shows an empty sidebar and nothing else: the extension starts recording
on its own in a repo you already work on with an AI tool (`.claude/` in the
repo, or Claude Code transcripts for that path), and asks once anywhere else —
"Start recording" / "Not now" / "Never here", remembered per workspace.
`chronicle.autoStart` (`auto` · `ask` · `off`) settles it either way, and an
untrusted workspace or a non-git folder is always left alone.

Starting is the same two steps `chronicle init` runs — scaffold the store, wire
the capture hooks — now shared by both surfaces via the provider's
`wireCapture()`, so the CLI and the extension can't drift.

Also: **Chronicle: Start recording this project** in the palette, a sidebar
empty state that offers to start instead of suggesting `chronicle import` for a
project that doesn't exist yet, and store watchers that attach to a project
started mid-session (no window reload).
