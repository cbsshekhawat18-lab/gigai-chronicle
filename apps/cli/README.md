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
| `chronicle status` | Project identity (incl. foreign-repo warning), store/index health, per-provider config with honest support notes |

Coming with their milestones: `import`/live capture (M7),
`replay`/`inspect`/`log`/`session`/`export` (M8).

## Conventions (stable forever)

- **`--json`** on every command: `{"apiVersion":1,"command":…}` envelope —
  the machine contract, snapshot-tested.
- **Exit codes:** `0` ok · `1` operational failure (incl. doctor findings) ·
  `2` usage error · `3` not a chronicle project.
- Zero network, no telemetry — `chronicle doctor` proves it on demand.

## Secret-audit note

`doctor --scan-secrets` reports finding **kinds and locations only** — the
report never contains the matched secret content, so it is safe to paste
into an issue.
