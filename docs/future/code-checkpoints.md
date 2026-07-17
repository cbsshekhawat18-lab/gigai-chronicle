# Code checkpoints & one-click revert ("click v1 → my code goes back")

> Status: **future proposal — needs a founder ADR before any implementation.**
> Origin: founder request 2026-07-17 ("people give prompt after prompt and
> mess the code — clicking v1 should revert the code to v1").

## Problem

Prompt-driven development damages working trees in small steps. Users want
time-travel: pick a moment in Chronicle (a prompt version, a replay frame)
and get their FILES back to that state — like VS Code's git UI, but at
prompt granularity, including between commits.

## Why Chronicle cannot do this today (by design, not by accident)

1. **Chronicle never stores file contents** — a published trust boundary
   (docs/privacy.md, PHASE-0 §14). There is nothing to restore FROM except
   git commits.
2. **Read git, never write it** (design law; single opt-in trailer
   exception). `git checkout`/`stash` from a Chronicle click is a git write.
3. Every event does record `git.head` + dirty paths — so restore to the
   **nearest commit** is *informationally* possible, but prompt-granular
   restore between commits is not: those states were never persisted
   anywhere.

## Proposed solution (for the ADR discussion)

**Git-native shadow checkpoints** — the design that adds restore without
breaking either boundary's *spirit*:

- On each captured prompt (or accepted-files event), write a **checkpoint
  commit into a hidden ref namespace** (`refs/chronicle/checkpoints/<ses>`)
  using `git stash create`-style plumbing — never touching HEAD, the index,
  the working tree, or any branch. Contents live in the user's own git
  object store (already trusted with their code), NOT in `.chronicle/`
  → the "Chronicle stores no file contents" promise holds.
- Restore = explicit, confirmed, user-initiated:
  1. auto-safety-checkpoint of the current state first (nothing is ever lost),
  2. `git restore --source <checkpoint> -- .`,
  3. recorded in the journey as a `WorkspaceRestored` event (additive spec).
- UI: version chips / replay frames get "⏪ Restore files from this moment";
  VS Code diff preview BEFORE restoring (already shipped for prompt bodies).

## Tradeoffs

- Requires amending the read-git-never-write law (second sanctioned write
  class: refs/chronicle/* + working-tree restore on explicit command) — a
  constitutional change, hence ADR + founder sign-off.
- Checkpoint refs are local-only by default (not pushed); optional sharing
  later. GC policy needed (`chronicle gc` grows a real job).
- Disk cost: git delta compression makes per-prompt checkpoints cheap.

## Impact

This is the single most-requested behavior of checkpoint-era AI editors
(Cursor checkpoints, Claude Code rewind) and composes uniquely with
Chronicle: we are the only layer that can tie checkpoints to the FULL
cross-tool journey. Decision needed: amend the law (ADR-0012) or keep the
boundary and ship "restore to nearest commit" only.
