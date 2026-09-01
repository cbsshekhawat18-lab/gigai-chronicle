# Changelog

All notable changes to Gigai Chronicle are documented here. The format is based
on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Gigai Chronicle is a monorepo managed with [Changesets](https://github.com/changesets/changesets),
so the **authoritative, per-package notes** live in each package's changelog and
in the [GitHub Releases](https://github.com/cbsshekhawat18-lab/gigai-chronicle/releases).
This file is a high-level, human-readable index across the whole project:

- CLI — [`apps/cli/CHANGELOG.md`](apps/cli/CHANGELOG.md)
- VS Code / Cursor / Windsurf extension — [`apps/vscode/CHANGELOG.md`](apps/vscode/CHANGELOG.md)
- Core / schema / UI / plugin-kit — [`packages/*/CHANGELOG.md`](packages/)

## [Unreleased]

_Nothing released yet. Changes land here via Changesets before the next tagged release._

## [0.4.1] — 2026-08-11

Maintenance and reach. Discoverability pass (SEO/docs metadata), dependency
updates, and a republish to the VS Code Marketplace and Open VSX.

## [0.4.0] — 2026-08-10

- **Project Memory** — derived, rebuildable, git-tracked memory of decisions,
  constraints, known issues, and current work, with required provenance and a
  hard privacy line between shared and local content.
- **AI Continuity** — context packs and handoffs to bootstrap a new agent
  (Claude, Codex, Gemini, Cursor) from the recorded history.
- **Development Intelligence** — explainable, model-free signals: file risk,
  why-not, repeated-mistake detection, and a pre-flight check for changes.

## [0.3.0] — 2026-07-26

First public release. Published to [npm](https://www.npmjs.com/package/gigai-chronicle),
the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=gigaichronicle.gigaichronicle-vscode),
[Open VSX](https://open-vsx.org/extension/gigaichronicle/gigaichronicle-vscode),
and GitHub Releases.

## [0.2.1] — 2026-07-25

Maintenance and fixes ahead of the public release.

## [0.2.0] — 2026-07-24

The VS Code / Cursor / Windsurf extension: a live Sessions view and the Timeline
webview rendering Replay-engine frames with fidelity badges and gap warnings.
The packaged extension is platform-independent and reads the store with a
pure-filesystem path (no native module in the bundle).

## [0.1.1] — 2026-07-22

Maintenance and fixes.

## [0.1.0] — 2026-07-18

Foundations: the pnpm + Turborepo TypeScript monorepo, the append-only event
store and query index, `chronicle init` and the three-identity model,
first-party Claude Code capture (live hooks + transcript backfill), and the
deterministic Replay engine.

[Unreleased]: https://github.com/cbsshekhawat18-lab/gigai-chronicle/compare/v0.4.1...HEAD
[0.4.1]: https://github.com/cbsshekhawat18-lab/gigai-chronicle/releases/tag/v0.4.1
[0.4.0]: https://github.com/cbsshekhawat18-lab/gigai-chronicle/releases/tag/v0.4.0
[0.3.0]: https://github.com/cbsshekhawat18-lab/gigai-chronicle/releases/tag/v0.3.0
[0.2.1]: https://github.com/cbsshekhawat18-lab/gigai-chronicle/releases/tag/v0.2.1
[0.2.0]: https://github.com/cbsshekhawat18-lab/gigai-chronicle/releases/tag/v0.2.0
[0.1.1]: https://github.com/cbsshekhawat18-lab/gigai-chronicle/releases/tag/v0.1.1
[0.1.0]: https://github.com/cbsshekhawat18-lab/gigai-chronicle/releases/tag/v0.1.0
