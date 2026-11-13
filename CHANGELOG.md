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

## [0.5.1] — 2026-11-13

**Capture you can trust to be on, a CLI you can install.**

- **npm: `npm i -g gigai-chronicle` works again.** 0.1.0–0.3.0 shipped
  `"better-sqlite3": "catalog:"` and failed with `EUNSUPPORTEDPROTOCOL`.
  Releases now go through `pnpm publish`, which rewrites `catalog:`/`workspace:`.
  `pnpm release` runs the full gate, and `pnpm release:check` (run in CI on all
  three OSes) packs the CLI, rejects any leftover protocol, installs the
  tarball into a clean prefix and runs `chronicle --version`. A manual
  *Release (npm)* workflow publishes from CI, dry-run by default.
- **No more silent dead capture.** Hooks run the `chronicle` CLI, and the
  extension doesn't ship it. Capture now has three states: `live`,
  `cli-missing` and `off`. "Live" requires `chronicle` to resolve on PATH,
  using the same lookup a shell does, including Windows `PATHEXT`.
  - `chronicle status` flags hooks without the CLI.
  - `chronicle doctor` fails on them.
  - `chronicle init` and `hooks install` say so.
  - The extension warns on activation and after Start, with *Copy install
    command* / *Learn more*, and its sidebar shows **Hooks installed, CLI
    missing** instead of "capture is live".
- **Committed hooks never error for teammates without the CLI**
  ([ADR-0018](docs/adr/0018-capture-hooks-quiet-without-the-cli.md)). Hook
  commands end in `; exit 0`, a form that works the same in `sh`, Git Bash and
  PowerShell. `chronicle hooks install claude-code` upgrades older hooks in
  place.
- **Redaction:** new token classes: Anthropic, OpenAI (project and legacy),
  Stripe live, GitHub fine-grained PATs, GitLab, npm, Hugging Face, xAI. New
  contextual classes redact *only* the secret and keep the context readable:
  URL passwords, credential `KEY=value` / `"key": "value"` assignments, and
  AWS secret access keys next to their name. Key names match as whole words,
  so `author` and `max_tokens` survive.
- **Workspace trust is enforced** on every command that writes: start, new and
  saved prompts, restore, handoff, Codex import. Each one asks you to trust
  the workspace first.
- **Multi-root workspaces:** one store per folder. The sidebar follows the
  active editor's folder, and *Start recording* asks which folder. The sidebar
  and dashboard act on the repository they're showing.
- **Extension build:** minified bundles with linked sourcemaps (kept out of the
  `.vsix`), and no more `import.meta` warning from the CJS bundle.
- **Honest listings:** continuity is claimed for Claude Code & Codex (more
  coming); Cursor and Windsurf are named as editors Chronicle runs in. The
  extension README lists every command and gains a real
  `code --install-extension` line. Its privacy text now says checkpoints are
  snapshots in a local hidden git ref.
- New projects' `config.json` `$schema` points at a URL that resolves.

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
