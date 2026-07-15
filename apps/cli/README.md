# chronicle CLI

Every core capability, headless ([ARCHITECTURE §14](../../docs/ARCHITECTURE.md#14-cli-design)).
Single-file esbuild bundle; cold start budget < 150ms (test-enforced).

## Commands (M4 skeleton)

| Command | Purpose |
|---|---|
| `chronicle doctor [--reindex] [--scan-secrets]` | The trust anchor: log integrity (heals torn writes), index freshness, retroactive secret audit, and the **zero-egress report** — prints every network destination Chronicle is configured to use (empty by default, provably) |
| `chronicle timeline [--since --until --branch --session --type… --limit]` | The journey, listed. The extension's timeline is this query with pixels |
| `chronicle status` | Store/index/capture health at a glance (honest: says no providers are installed until M6/M7 land) |

Coming with their milestones: `init` (M6), `import`/live capture (M7),
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
