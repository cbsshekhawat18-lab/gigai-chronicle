# 0009 — Repository fingerprint algorithm & remote-URL normalization

- Status: Accepted
- Date: 2026-07-15
- Relates: [ARCHITECTURE.md §6](../ARCHITECTURE.md#6-identity-model-project-repository-workspace); milestone M6. **Spec v1 surface** — third-party implementations must reproduce this byte-for-byte.

## Context

The repository identity distinguishes "same project, same history" from
"project id pasted into an unrelated repo" and groups remotes/forks. §6
defines it as `sha256( sorted(root-commit SHAs) ∥ normalized remote URL set )`
but leaves serialization, normalization, and edge cases open.

## Decision

**Inputs.**

- `roots`: full 40-hex SHAs from `git rev-list --max-parents=0 HEAD`,
  lexicographically sorted. In a **shallow** repository
  (`git rev-parse --is-shallow-repository` = true) the boundary commits are
  grafts, not true roots: `roots` is recorded as **empty** and the state is
  flagged `shallow` (surfaced by doctor, never an error).
- `remotes`: fetch URLs from `git remote -v`, normalized (below),
  deduplicated, lexicographically sorted.

**Remote-URL normalization** (each rule applied in order):

| Rule | Example |
|---|---|
| scp-like `user@host:path` → `host/path` | `git@github.com:Acme/API.git` → `github.com/Acme/API` |
| URL forms: drop scheme + userinfo, keep `host[:port]/path` | `ssh://git@host:2222/a/b` → `host:2222/a/b` |
| lowercase the host (never the path — some hosts are case-sensitive) | `GitHub.com/Acme/API` → `github.com/Acme/API` |
| strip one trailing `.git` and any trailing `/` | `…/API.git` → `…/API` |
| non-URL strings (local paths, bundles) pass through unchanged | `/mnt/repos/api.bundle` |

**Digest.** `sha256` (hex) of the UTF-8 string:

```
chronicle-repo-fingerprint/1
roots
<sha>\n …one per line, sorted
remotes
<url>\n …one per line, sorted
```

When both sets are empty (unborn HEAD, no remotes) the digest is **null** —
an unidentifiable-yet-valid state, surfaced by doctor.

**Foreign-repo detection compares roots, not digests**: the fingerprint's
remote component legitimately drifts (adding a fork remote must NOT trip the
guard — §6). A store is foreign iff recorded roots and current roots are
both non-empty and **disjoint** (`E_FOREIGN_REPO` warning, never silent
history merging).

## Consequences

- Recorded per workspace in `.chronicle/.local/machine.json` as components
  (`roots`, `remotes`, `digest`, `shallow`) so the disjointness check needs
  no recomputation of history.
- The version prefix (`…/1`) makes future algorithm revisions explicit
  spec bumps rather than silent drift.
