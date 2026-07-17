---
"@gigaichronicle/core": minor
"@gigaichronicle/cli": minor
---

Prompt library — version control for prompts (§5.4, pulled forward from
Phase 2 by founder decision, ADR-0011). Curated versioned Markdown in
`.chronicle/prompts/<slug>/` (frontmatter + immutable `versions/v<N>.md`,
git-synced); hand edits to prompt.md snapshot as the next version;
identical-content saves are no-ops; plain-text unified diff with zero new
dependencies. CLI: `chronicle prompt save|list|show|versions|diff`
(--title/--tags/--text/--from-file/--session provenance).
