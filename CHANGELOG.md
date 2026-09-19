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

_Nothing released yet. Changes land here before the next tagged release._

## [0.5.0] — 2026-09-19

**Chronicle starts itself.** Setting a project up was two commands, and the
second one — `chronicle hooks install claude-code` — was the one nobody ran.
Skipping it produced a project that looked initialized, reported
`capture claude-code:auto`, and recorded nothing.

- **`chronicle init` now starts capture**, wiring the hooks in the same command.
  Only for a detected tool, skipped when user-scope hooks already cover the repo
  (installing at both scopes doubles every event), `--no-hooks` to opt out, and
  `.claude/settings.json` listed in init's footprint.
- **The extension starts a project on its own.** Open a git repo you already
  work on with an AI tool and Chronicle begins recording it; anywhere else it
  asks once — "Start recording" / "Not now" / "Never here", remembered per
  workspace. `chronicle.autoStart` (`auto` · `ask` · `off`) settles it either
  way. Untrusted workspaces and non-git folders are never written to.
- **`chronicle status` reports the wiring, not the intent** — a new `hooks` line
  says `NOT INSTALLED — nothing is being recorded` instead of leaving a silent
  project looking healthy.
- **Chronicle: Start recording this project** in the command palette, a sidebar
  empty state that offers to start instead of suggesting `chronicle import` for
  a project that doesn't exist yet, and store watchers that attach to a project
  started mid-session — no window reload.

npm note: 0.4.0 and 0.4.1 shipped to the VS Code Marketplace and Open VSX only,
so this release also brings the npm CLI up from 0.3.0.

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
