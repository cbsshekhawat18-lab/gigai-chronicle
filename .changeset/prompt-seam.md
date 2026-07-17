---
"@gigaichronicle/core": minor
"@gigaichronicle/cli": minor
"gigaichronicle-vscode": minor
---

The prompt seam (ADR-0014): promote a prompt you already typed into the
library — no retyping. Chronicle captured every prompt you wrote, and kept a
curated library, but nothing joined them: the only way to library a good
prompt was to type it a second time, which is the manual hoarding P1
describes.

- `chronicle prompt save <slug> --from-last` — save the one you just typed.
  Also `--from-event <evt>` and `--from-session <ses>`.
- VS Code: a **Save prompt** button on the Sessions view. Pick a captured
  prompt, then pick where it lands — new prompt, or a new version of an
  existing one. That step makes the versioning model visible instead of
  implied.
- Provenance is automatic: a promoted prompt records the session it came from.
- Prompts over 64KB (spilled to a blob sidecar, §7.2 rule 5) resolve
  correctly — the long, carefully-built ones are exactly what a library is
  for, and silently dropping them would have been the bug.

Promotion stays deliberate: nothing auto-saves to the library, because a
library where every prompt lands is just a worse event log. This removes the
retyping, not the choosing.
