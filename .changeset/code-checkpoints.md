---
"@gigaichronicle/core": minor
"@gigaichronicle/cli": minor
"@gigaichronicle/provider-claude-code": patch
"@gigaichronicle/schema": patch
"gigaichronicle-vscode": minor
---

Code checkpoints & one-click restore (ADR-0012, founder request: "click v1
→ code reverts — people prompt after prompt and mess the code"). Each
captured prompt snapshots the working tree into a hidden git ref
(`refs/chronicle/ckpt/*`) in the user's own object store — file contents
never enter `.chronicle/`, and `.chronicle/` itself is excluded so a restore
never rewrites the journey. `chronicle restore <evt>` (and a ⏪ button on
replay prompts) puts the code back, always safety-checkpointed and preview-
confirmed, recording `Ext.chronicle.WorkspaceRestored`. Opt-out via
`capture.checkpoints: false`. Amends the read-git-never-write law with a
second sanctioned, opt-out write class.
