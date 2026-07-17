# 0012 — Git-native code checkpoints & explicit restore (founder decision)

- Status: Accepted
- Date: 2026-07-17
- Amends: design law "read git, never write it" (ARCHITECTURE §2); design
  per [docs/future/code-checkpoints.md](../future/code-checkpoints.md)
- Founder direction: "click v1 → code reverts — people prompt after prompt
  and mess the code."

## Decision

The read-git-never-write law gains a **second sanctioned write class**
(after the opt-in trailer):

1. **Shadow checkpoints** — on every captured prompt, Chronicle snapshots
   the working tree (tracked + untracked, `.gitignore` respected) into the
   user's own git object store via plumbing that NEVER touches HEAD, the
   index, branches, or the working tree:
   temp-index `add -A` → `write-tree` → `commit-tree` →
   `update-ref refs/chronicle/ckpt/<evt_id>`. When the tree equals HEAD's,
   the ref points at HEAD (no new objects). Failures are silent — capture
   is never blocked (law 8). Config: `capture.checkpoints` (default on).
2. **Explicit restore** — `chronicle restore <evt_id>` / the ⏪ button:
   ALWAYS creates a safety checkpoint of the current state first
   (`refs/chronicle/safety/<ms>` — nothing is ever lost), then
   `git restore --source <ckpt> --worktree -- .`, requires confirmation
   (TTY prompt / editor modal; `--force` for scripts), and records
   `Ext.chronicle.WorkspaceRestored` in the journey.

**Boundary preserved:** file contents still never enter `.chronicle/` —
checkpoints live in `.git`'s object store, which already holds the user's
code. Checkpoint refs are local (not pushed by default).

**Honest v1 limitation (stated in output):** restore updates files that
existed at the checkpoint; files created after it are left in place and
listed as untouched.

## Consequences

- `chronicle gc` (Phase 2) gains a real job: checkpoint-ref retention.
- The boundary-honesty line in privacy.md gains a sentence covering the new
  write class; the no-file-contents-in-Chronicle promise is unchanged.
