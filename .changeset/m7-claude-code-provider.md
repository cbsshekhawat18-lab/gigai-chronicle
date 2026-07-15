---
"@gigaichronicle/provider-claude-code": minor
"@gigaichronicle/core": patch
"@gigaichronicle/cli": minor
---

M7 — First Provider: Claude Code. Tier-1 live capture (five hooks mapped
through the Event Engine; fire-and-forget: `chronicle capture` exits 0
always) + tier-2 transcript backfill (`chronicle import claude-code`,
idempotent per-file cursors, format-fingerprinted with drift watermarks —
skipped-and-degraded, never half-imported), session UUID→`ses_` mapping,
Stop-hook response enrichment from the transcript tail, settings merge with
etiquette (`chronicle hooks install|uninstall`, plan shown, never clobbers,
removes exactly ours). Core adds `openProviderEngine` to the emit surface.
Synthetic fixture corpus incl. the format-drift CI canary; provider guide
draft (docs/providers/writing-a-provider.md).
