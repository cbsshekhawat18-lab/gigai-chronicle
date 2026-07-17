# chronicle CLI

Every core capability, headless ([ARCHITECTURE §14](../../docs/ARCHITECTURE.md#14-cli-design)).
Single-file esbuild bundle; cold start budget < 150ms (test-enforced).

## Quickstart

```bash
cd your-git-repo
chronicle init            # 3 questions, all skippable — or: chronicle init --yes
chronicle status          # project identity, store, index, provider config
chronicle doctor          # integrity + the zero-egress proof
```

`init` touches exactly: `.chronicle/config.json`, `.chronicle/.gitignore`,
`.gitattributes` (one appended line), and your journey's first event
(`ProjectCreated` — a committed, shared event by design). Renaming, moving,
cloning, or forking the repo never breaks history: identity lives in the
project ULID and root-commit fingerprint, never in paths (ADR-0009).

## Commands

| Command | Purpose |
|---|---|
| `chronicle doctor [--reindex] [--scan-secrets]` | The trust anchor: log integrity (heals torn writes), index freshness, retroactive secret audit, and the **zero-egress report** — prints every network destination Chronicle is configured to use (empty by default, provably) |
| `chronicle timeline [--since --until --branch --session --type… --limit]` | The journey, listed. The extension's timeline is this query with pixels |
| `chronicle init [--yes] [--name] [--metadata-only] [--private-sessions] [--git-trailer]` | Initialize: mint identity, scaffold, detect tools, record ProjectCreated (M6) |
| `chronicle prompt save\|list\|show\|versions\|diff` | Version control for prompts: immutable versions, plain-text diffs, git-synced (§5.4, ADR-0011). `save --from-last` promotes the prompt you just typed — no retyping (ADR-0014) |
| `chronicle why <file> [--limit n]` | **What was ASKED that made this file.** `git blame` says *who*; this says *why* — the prompt behind each change, with a ⏪ restore handoff (ADR-0013) |
| `chronicle status` | Project identity (incl. foreign-repo warning), store/index health, per-provider config with honest support notes |

Coming with their milestones: `import`/live capture (M7),
`replay`/`inspect`/`log`/`session`/`export` (M8).

## Conventions (stable forever)

- **`--json`** on every command: `{"apiVersion":1,"command":…}` envelope —
  the machine contract, snapshot-tested.
- **Exit codes:** `0` ok · `1` operational failure (incl. doctor findings) ·
  `2` usage error · `3` not a chronicle project.
- Zero network, no telemetry — `chronicle doctor` proves it on demand.

## `chronicle why` — the question git can't answer

```console
$ chronicle why packages/core/src/prompts/prompts.ts
why packages/core/src/prompts/prompts.ts looks like this — 1 prompt(s):

  2026-07-17 07:33     +65 −1  "histry not like that UI make like git tree view this is very basic"
                               ⏪ chronicle restore evt_01KXQFWE3F8BCXD1MZ7K3HFNEX
```

Nothing extra is recorded to answer this. Capture already snapshots the tree
at every prompt (ADR-0012), so consecutive checkpoints bracket a turn and the
diff between them *is* that prompt's work — derived on demand, never stored,
so it cannot drift from the code.

Read it honestly: a turn's diff is everything that changed while that turn was
open, including edits you typed yourself and work the agent carried over from
your previous message. It reports **what happened during this prompt**, not a
claim about what the model wrote. Code written before capture was running has
no answer, and `why` says so rather than guessing.

## Secret-audit note

`doctor --scan-secrets` reports finding **kinds and locations only** — the
report never contains the matched secret content, so it is safe to paste
into an issue.
