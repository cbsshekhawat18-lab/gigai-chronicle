---
"@gigaichronicle/core": minor
"gigaichronicle-vscode": minor
---

Prompt version history as a git-graph (founder feedback: "make it like git
tree view, not basic v1/v2 chips"). Core adds per-version `savedAt`
frontmatter and `promptHistory()` — one node per version with save time,
line count, subject preview, and add/remove stats vs the parent. The
sidebar renders a proper commit rail: dots on a vertical line, the current
version marked in accent, each node showing +added/−removed and time-ago;
clicking a node opens VS Code's native diff of that version against its
PARENT (git-log behavior: "what changed IN this version"), v1 against the
empty tree.
