# 0013 — Intent attribution (`chronicle why`) pulled forward into v0.1 (founder decision)

- Status: Accepted
- Date: 2026-07-17
- Relates: [ADR-0012](0012-git-native-code-checkpoints.md) (the data this reads —
  and the timing invariant this depends on),
  [ADR-0011](0011-prompt-library-pulled-forward.md) (the precedent for pulling a
  surface forward), [ADR-0006](0006-positioning-ai-development-history.md)
  (replay stays the hero; this does not displace it),
  [PHASE-0 §1.1](../PHASE-0.md#11-the-problem-stated-precisely) (**P1, P2** — the
  individual pains; P3/P4 are explicitly *not* served, see Consequences),
  [PHASE-0 §5](../PHASE-0.md#5-product-boundaries) (boundary 10: never scores developers),
  [ARCHITECTURE.md §11](../ARCHITECTURE.md) (derived views never live in the log)

## Context

Every surface shipped in v0.1 is either **recording** (capture, import, log,
checkpoints) or **browsing** (timeline, replay, sessions, sidebar, prompt
versions). Both require the developer to go and look. PHASE-0 §1.2 already
concedes the consequence — *"nobody wakes up desperate for a timeline"* — and
banks on episodic pains (P3–P6) converting retention into advocacy.

Two facts made this ADR:

1. **The individual has no point-of-pain surface.** "Why is this code like
   this?" is the question developers actually ask, at a precise moment,
   with the most-used forensic tool in software (`git blame`) as its obvious
   analog. Browsing a timeline answers it only if you already know to go
   looking.

   This ADR does **not** claim the Git AI gap. PHASE-0 §2 names Git AI
   *"strategically the most serious competitor for **teams**"*, and its
   attribution lives in the repository, so it survives a clone. Chronicle's
   checkpoints do not (see Consequences) — `why` is a personal tool and
   closes nothing for teams. Chronicle's team answer remains replay
   ([ADR-0006](0006-positioning-ai-development-history.md)), which travels
   because the journal is committed plain text.

2. **ADR-0012 already shipped the answer without noticing.** Capture takes a
   shadow checkpoint at every captured prompt. A checkpoint therefore holds
   the state its own turn *started from*, so consecutive checkpoints bracket
   a turn exactly:

   ```
   ckpt(P1) ──turn of P1──▶ ckpt(P2) ──turn of P2──▶ ckpt(P3) ──turn of P3──▶ worktree
   ```

   Per-prompt, line-level attribution is thus **already on disk in every
   repo running capture** — derivable with no new capture, no new events, no
   schema change, and no line tracking. Verified on the dogfooding store
   before this ADR was written.

Founder decision (2026-07-17): expose it. Per IMPLEMENTATION-MODE ("ADR
before any deviation"), the record is here rather than in silent code.

## Decision

Ship `chronicle why <file>`, backed by `changesByPrompt()` in core.

- **Derived, never stored.** The answer is recomputed from refs on demand, so
  it cannot go stale or disagree with the checkpoints. Consistent with §11:
  derived views are projections, not log entries. No `CodeAttributed` event
  type is added — the taxonomy freeze holds, exactly as in ADR-0011.
- **The off-by-one is the contract.** The diff between consecutive
  checkpoints is attributed to the **earlier** prompt, because the checkpoint
  is taken *when a prompt is submitted*. The newest checkpoint compares
  against the live working tree; that turn is still open and is marked so.
- **Tree-to-tree, never tree-to-worktree.** The open turn's end state is
  materialized with the same throwaway-index snapshot a checkpoint uses
  (`worktreeTree()`). An untracked file exists in checkpoint trees but not in
  the repo's index, so a plain `git diff <checkpoint>` would report it
  **deleted** and blame an innocent prompt. Comparing like with like is a
  correctness requirement, not an optimization.
- **`.chronicle/` is never attributed.** The journal is not code. Checkpoint
  trees already exclude it, but a clean-tree checkpoint aliases to HEAD,
  whose tree may track it — so the pathspec excludes it on both sides.
- **Newest-first scan, `--limit` (default 10).** The common question is "what
  recently shaped this file?", so cost tracks the answer, not the history.
- **`--json`** per the §14 envelope; exit codes unchanged (2 = path outside
  the repo, 0 = no answer — absence of an answer is not a failure).

## Consequences

- **`why` is a personal tool. It does not travel — this is the defining
  limit.** ADR-0012 keeps checkpoints in `refs/chronicle/ckpt/*`, which git
  does not push (not under `refs/heads/*`, no refspec configured). Verified
  against a fresh clone of the dogfooding repo: 11 session logs arrive, **0
  checkpoints**, and `why` correctly answers "no captured prompt is known to
  have changed this file". Therefore:
  - **P1/P2 (the individual pains) are served** — "why is *my* code like
    this", answered where the developer already stands.
  - **P3 (unreviewable provenance) and P4 (incident forensics) are NOT
    served**, and this ADR does not pretend otherwise. Both are team pains
    across machines; a reviewer's clone has no checkpoints. Chronicle's
    answer for them is replay, which travels because the journal is
    committed plain text — that same clone replays every prompt, response,
    and tool call with zero setup.
  - The Git AI competitive gap (PHASE-0 §2, a *teams* gap) therefore stays
    open. Closing it would require checkpoint refs to be pushed — a distinct
    decision with a real privacy cost (it puts a prompt→code map on the
    remote) and it belongs in its own ADR, on its own merits, not smuggled
    in here.
- `git blame` says *who*. `chronicle why` says *what was asked*. The two
  compose; neither replaces the other.
- **Boundary 10 holds: this never scores developers.** Attribution here is
  prompt→diff, never developer→metric, and there is deliberately no
  aggregation, no ranking, and no per-author rollup. The road from per-turn
  attribution to a leaderboard is short, and PHASE-0 §5 already fenced it —
  that fence is restated, not relaxed. Any aggregate view over `why` needs a
  superseding ADR that argues against boundary 10 explicitly.
- **This ADR depends on an ADR-0012 invariant that nothing enforces.** The
  off-by-one is correct *only* because checkpoints fire at prompt-submit
  (pre-turn). A provider that ever checkpoints post-turn would silently
  invert every answer — attributing each turn's work to the *next* prompt,
  with no error and no visible symptom. The invariant is currently protected
  by tests inside this feature, not by a contract at the capture boundary.
  Any change to checkpoint timing must treat this as a breaking change.
- **Attribution is per-turn, not per-intent — the honest caveat.** A turn's
  diff is everything that changed while it was open, including the human's
  own edits and any work the agent carried over from a previous request. On
  the dogfooding store, "Ithink now we ready to prod right just tell me?"
  correctly shows +101/−16 because the agent finished and committed the
  previous turn's UI work during it. This is truthful about *what happened*
  and is deliberately not dressed up as "what the model wrote" — a claim
  Chronicle cannot make without lying.
- Only work done while capture was running is attributable; older code has no
  answer and says so, naming why.
- Renames are not followed across turns; a path is a path.
- `worktreeTree()` is now exported from core and shared with `snapshot()` — a
  pure extraction, covered by the existing ADR-0012 suite.

## Alternatives rejected

- **Track line ranges at capture time.** New payload fields, a spec bump, and
  a permanent drift risk between what was recorded and what git holds — to
  produce something the checkpoints already imply. Rejected.
- **Store attributions as events.** Derived data in an append-only log rots
  the moment history is rewritten around it, and §11 already settles that
  links (the analogous edge) never live in the log. Rejected.
