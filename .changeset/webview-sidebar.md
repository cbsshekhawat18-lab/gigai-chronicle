---
"gigaichronicle-vscode": minor
---

Card-style sessions sidebar (founder decision: the polished Codex/GitLens
look — native trees cannot render cards). The sidebar becomes a webview
view with the full card UI: human names, provider/model badges, live-now
green highlight, provider filter chips — still the ONE session list, with
the timeline panel staying pure replay. Auto-started empty sessions (one
per VS Code reload via the Claude Code startup hook) now group into a
collapsed "empty sessions" section instead of burying real work. Webview
bundles renamed explicitly (timeline.js, sessions.js).
