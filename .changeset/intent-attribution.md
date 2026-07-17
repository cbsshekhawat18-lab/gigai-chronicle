---
"@gigaichronicle/core": minor
"@gigaichronicle/cli": minor
---

`chronicle why <file>` — intent attribution (ADR-0013). `git blame` says
*you* changed the line; this says **what was asked**. Answered entirely from
data that already existed: capture takes a shadow checkpoint at every prompt
(ADR-0012), so consecutive checkpoints bracket a turn and the diff between
them is that prompt's work. No new capture, no new events, no schema change,
no line tracking — `changesByPrompt()` derives it from refs on demand, so it
can never go stale. Prints the churn per prompt with a `⏪ chronicle restore`
handoff, and `--json` per the §14 envelope.

Honest by construction: a turn's diff is everything that changed while the
turn was open (including your own edits), so it reports *what happened during
this prompt* rather than claiming to know what the model wrote; work from
before capture was running has no answer and says so.

Also: `worktreeTree()` is exported from core — comparing checkpoint trees to
a materialized worktree tree (rather than to the index) is what keeps
untracked files from being misreported as deletions.
