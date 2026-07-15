# M6 — Who Am I: `chronicle init` + the three-identity model

> **Tracking issue (epic)** for GitHub Milestone **`M6 — Init/Identity`** · Target: Week 3 · Depends on: M4, M5
> Labels: `epic` `area:cli` `area:core` `type:feature` `P0` `phase-1`

## Goal

A repo can be initialized in one command, and its history is bound to
identities that survive every rename, move, clone, and fork — paths are
display strings, never identity ([ARCHITECTURE.md §6](../ARCHITECTURE.md#6-identity-model-project-repository-workspace)).
`chronicle init` is also the product's first impression: a respectful,
diff-showing, consent-first setup.

## Demo

Terminal recording, linked from this epic: init a repo → record events →
`mv` the folder → clone it to a second location → both copies show continuous
history; `git diff` after init shows exactly three touched paths.

## Deliverables

- **Identity:** `prj_` mint + `ProjectCreated` (committed `config.json`);
  `wks_` in `.local/machine.json`; repository fingerprint
  (root-commits ∥ remotes, derived+cached); `WorkspaceMoved` on path change;
  `E_FOREIGN_REPO` doctor warning (project id in an unrelated repo).
- **Scaffold:** `.chronicle/` layout, auto `.gitignore`, `.gitattributes`
  `linguist-generated` entries (A3).
- **Init interview:** redaction mode (secrets-only default | metadata-only),
  default visibility, detected providers + backfill offer, opt-in trailer —
  every choice skippable with sane defaults; `--yes` for scripted setup.
- **Status:** `chronicle status` (active session, per-provider capture
  health tier, index freshness); `ProjectOpened` throttle (≤1/day/workspace,
  local).
- **ADR:** repository-fingerprint algorithm (root-commit set ∥ normalized
  remote set) — recorded because third-party implementations must reproduce it
  (Spec v1 surface).

## Work breakdown (child issues)

- [ ] ADR: fingerprint algorithm + remote-URL normalization rules (S, decision)
- [ ] Identity mint + config read/write (M)
- [ ] Workspace state + `WorkspaceMoved` detection (M)
- [ ] Fingerprint compute/cache + foreign-repo guard (M)
- [ ] Scaffold + `.gitattributes` writer (S)
- [ ] Init interview + `--yes` path (M)
- [ ] `chronicle status` (S)
- [ ] Identity scenario test suite (rename/move/clone/fork/two-clones/no-remote) (L)
- [ ] Init UX copy review (S) `good-first-issue`

## Definition of Done

1. All eight scenarios from the [§6 table](../ARCHITECTURE.md#6-identity-model-project-repository-workspace)
   pass as automated tests — history intact and correctly bound in each.
2. Post-init `git diff`: only `config.json`, `.chronicle/.gitignore`,
   `.gitattributes` lines.
3. `config.json` matches the trimmed v2 schema (no dead keys).
4. Works in the paths-with-spaces fixture on all three OSes.
5. Process gates: fingerprint ADR merged; init flow documented in the
   user-facing quickstart; changeset.

## Risks

| Risk | Mitigation |
|---|---|
| Remote-URL normalization edge cases (ssh vs https, trailing `.git`, hosts with ports) | Normalization rules are in the ADR with a test table; unknown forms fall back to raw-string inclusion (fingerprint still stable) |
| Init interview friction contradicts "invisible until needed" | Hard cap: ≤3 questions, all with defaults; `--yes` is first-class and documented in the README quickstart |
| Shallow clones lack root commits | Detect shallow; fingerprint degrades to remote-set-only with a doctor note (honesty over failure) |

## Release / versioning

First end-to-end user story without capture: init → manual `chronicle log`
→ `timeline`. Internal tag `v0.1.0-alpha.4`.

## References

[ARCHITECTURE.md §6](../ARCHITECTURE.md#6-identity-model-project-repository-workspace) · [§7.3](../ARCHITECTURE.md#7-on-disk-format-the-chronicle-spec) · [CAPTURE-SURFACES.md §9.3](../CAPTURE-SURFACES.md#9-design-consequences-what-this-audit-changes)
