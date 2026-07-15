# Writing a provider (draft 1 — extracted from `provider-claude-code`)

> The Claude Code provider is the template; this guide names the parts so
> your provider PR is a copy-and-adapt, not an invention. Spec basis:
> [SPEC-ROADMAP.md v2](../SPEC-ROADMAP.md); rules: [ARCHITECTURE.md §4, §16](../ARCHITECTURE.md#4-the-hard-problem-capture).

## The five parts

1. **Identity + capability** (`identity.ts`) — your `ProviderIdentity` and a
   `CAPABILITY` object that must match your row in
   [PROVIDERS.md](../PROVIDERS.md). Claims are conformance-tested, not asserted.
2. **Pure mapping** (`hooks.ts` / `transcript.ts`) — tool-shaped input →
   `RawCandidate[]`. Pure and synchronous: this is where 90% of your tests
   live. Unknown input maps to `null`/drift — never a throw.
3. **Capture entry** (`capture.ts`) — called by the tool's hook via
   `chronicle capture <id> --event <name>`. Contract: **never throws, caller
   exits 0 always**, failures become `reportDegraded()` where possible.
4. **Backfill** (`backfill.ts`) — `chronicle import <id>`. Idempotent via
   per-file cursors in `.local/providers/<id>/`; format-fingerprinted with a
   drift threshold; a drifted file is skipped + degraded, never half-imported.
5. **Install etiquette** (`settings.ts`) — if the tool has hook config:
   merge-never-clobber, entries identified by command prefix (never
   position), plan shown before consent, one-command uninstall that removes
   exactly yours.

## The rules the lint enforces

- Your only core import is **`@gigaichronicle/core/emit`**
  (`openProviderEngine`, `EventEngine`, `fixedGitReader`). No store, no
  index, no queries — including in your tests (verify via raw files + the
  schema parser instead).
- Tool-specific moments go under `Ext.<your-id>.<Name>`; core types are fixed.
- Machine-local state lives under `.chronicle/.local/providers/<your-id>/`.

## The tests you must ship

Recorded **synthetic or scrubbed-and-reviewed** fixtures (SECURITY.md policy;
two-pass review), a format-drift fixture that must degrade cleanly, a CI
canary asserting the current-format fixture parses with **zero** unknown
lines (a red canary means the tool's format moved), idempotent-rerun
backfill test, and the capability-conformance check against PROVIDERS.md.
