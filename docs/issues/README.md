# MVP Milestones (Phase 1) — index & process

> The MVP is run as **10 milestones**, each with a tracking issue (epic) in
> this directory. Order follows the v2 build law
> (`Capture → Storage → Replay → Timeline` — [ARCHITECTURE.md §23](../ARCHITECTURE.md#23-roadmap-development-order--phase-mapping)).
> **Nothing starts until decisions D6–D11 are signed off**
> ([ARCHITECTURE.md §24](../ARCHITECTURE.md#24-decision-log-resolved--newly-open));
> ratifying them as ADRs is itself an M1 deliverable.

## The milestones

| M | Epic | Week | Depends on | Version at close |
|---|---|---|---|---|
| M1 | [Foundations: monorepo, CI, governance](001-monorepo-scaffold-ci.md) | W1 | D6–D11 sign-off | — |
| M2 | [The Contract: `packages/schema` (Spec v1 artifacts)](002-schema-chronicleevent.md) | W1–2 | M1 | `schema@0.1.0-alpha` |
| M3 | [Truth on Disk: append-only EventLog](003-chronicle-store-eventlog.md) | W1–2 | M2 | `core@0.1.0-alpha` |
| M4 | [Disposable Speed: SQLite index + doctor + CLI skeleton](004-sqlite-index-doctor.md) | W2 | M3 | `v0.1.0-alpha.2` |
| M5 | [The Only Door: Event Engine (redaction)](005-event-engine.md) | W2–3 | M2, M3 | `v0.1.0-alpha.3` |
| M6 | [Who Am I: init + three-identity model](006-init-identity-model.md) | W3 | M4, M5 | `v0.1.0-alpha.4` |
| M7 | [First Provider: Claude Code](007-claude-code-provider.md) | W3 | M5, M6 | `v0.1.0-alpha.5` (dogfood begins) |
| **M8** | [**The Capability: Replay — GATE**](008-replay-engine.md) | W4 | M3, M4, M7 | `v0.1.0-beta.1` |
| M9 | [The Differentiator: git correlation](009-git-correlation.md) | W5–6 | M4, M5 + **M8 gate** | `v0.1.0-beta.2` |
| M10 | [The Face: VS Code extension + public launch](010-vscode-extension-mvp.md) | W5–6 | M8, M9 | **`v0.1.0` public** |

W7 (P1 stretch: FTS surfacing, inspect polish) and W8 (hardening, docs,
launch) become milestones **only after the M8 gate passes** — deliberately
not issue-shaped yet.

## Milestone rules (uniform Definition of Done)

No milestone closes without, in addition to its own exit criteria:

1. **Green CI on all three OSes** — including the network-denial harness and
   any perf budgets the milestone owns ([§19](../ARCHITECTURE.md#19-performance-strategy);
   budgets are merge gates, not aspirations).
2. **A demo artifact** linked from the epic (recording, fixture PR, or
   terminal capture) — "done" must be *visible*, not asserted.
3. **Docs shipped with code** — user-facing pages for user-facing behavior,
   spec-draft updates for on-disk/wire behavior.
4. **A changeset** (Changesets manages every version bump from M2 onward).
5. **ADRs for decisions** — anything that deviates from ARCHITECTURE v2 or
   settles something it left open gets an ADR *before* the implementing PR
   (the project dogfoods its own knowledge layer — [PHASE-0.md §16](../PHASE-0.md#16-open-source-strategy)).
6. **Conventional commits + DCO sign-off** on every commit; every PR carries
   tests (adapters/providers additionally carry recorded fixtures).

**The M8 gate is special:** it is passed by an *outside developer's* recorded
"oh" at a terminal replay of their own history — not by the maintainer's
satisfaction. M9/M10 are blocked until then, by policy.

## Epic template (used by all 10)

`Goal · Demo (what done looks like) · Deliverables · Work breakdown (child
issues, S/M/L sized, good-first-issue flagged) · Definition of Done · Risks
& mitigations · Release/versioning · References` — child issues are spun out
of the epic when the milestone opens, each linking back with
`Part of #<epic>`.

## Setting up on GitHub (when the repo exists)

```bash
# labels
for l in epic area:infra area:schema area:core area:cli area:providers area:extension \
         type:feature type:chore P0 phase-1 security spec gate good-first-issue decision; do
  gh label create "$l" || true
done

# milestones (due dates from the 8-week plan start date)
for m in "M1 — Foundations" "M2 — Schema" "M3 — Store/Log" "M4 — Index/Doctor" \
         "M5 — Event Engine" "M6 — Init/Identity" "M7 — Provider #1" \
         "M8 — Replay (GATE)" "M9 — Correlation" "M10 — Extension"; do
  gh api repos/{owner}/{repo}/milestones -f title="$m" || true
done

# epics: create in file order into an empty tracker (file 001 → issue #1 …)
for f in docs/issues/0*.md; do
  title=$(head -1 "$f" | sed 's/^# //')
  gh issue create --title "$title" --body-file "$f" --label epic
done
```

Then: assign each epic to its milestone, pin M8, and spin child issues out
of each epic's work-breakdown checklist as its milestone opens (checklist
items convert to issues with GitHub's task-list feature, inheriting the
milestone).

## Why milestones and not a flat issue list

The v2 architecture's central claims (pipeline law, replay-first, honesty)
are *sequencing* claims — they are only enforceable if the work is sequenced.
Milestones with hard dependencies and one explicit gate encode the
architecture into the project management itself: the same discipline the
docs demand of the code.
