<p align="center">
  <img src="assets/brand/logo.png" width="380" alt="Gigai Chronicle logo — a G forged on an anvil" />
</p>

<h1 align="center">Gigai Chronicle</h1>

<p align="center"><strong>Build software with AI. Never lose the journey.</strong></p>

<p align="center">
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/code-MIT-blue.svg"></a>
  <img alt="Node" src="https://img.shields.io/badge/node-%E2%89%A520.19-brightgreen.svg">
  <img alt="Zero network" src="https://img.shields.io/badge/network-zero%20by%20default-success.svg">
  <img alt="Local-first" src="https://img.shields.io/badge/data-local--first-success.svg">
</p>

---

Git answers **what changed**. It has never answered **what was asked**.

As AI writes more of your code, that second history — the prompts, the
attempts, the reasoning, the things you rejected — is scattered across
tool-specific log files or thrown away. Chronicle keeps it: an append-only,
plain-text record of your AI-assisted development, **inside your own repo**,
that travels by `git clone` like everything else.

No account. No server. No network. It never calls a model.

## The question it answers

```console
$ chronicle why packages/core/src/prompts/prompts.ts

why packages/core/src/prompts/prompts.ts looks like this — 1 prompt(s):

  2026-07-17 07:33     +65 −1  "histry not like that UI make like git tree view this is very basic"
                               ⏪ chronicle restore evt_01KXQFWE3F8BCXD1MZ7K3HFNEX
```

`git blame` says **you** wrote those 65 lines. Chronicle says **what you
asked for** — and can put the code back to the moment before you asked.

## What you get

| | |
|---|---|
| 🔍 **`chronicle why <file>`** | The prompt behind each change — the question `git blame` can't answer |
| ⏪ **`chronicle restore <evt>`** | Put your code back to how it was at any prompt. Always safety-checkpointed — nothing is lost |
| ▶️ **`chronicle replay <session>`** | Step through what happened: prompts, responses, tools, commits, interleaved |
| 📚 **`chronicle prompt save --from-last`** | Keep the prompt that worked. Versioned, diffable, shared by git |
| 🩺 **`chronicle doctor`** | The trust anchor: log integrity, secret audit, and a proof that nothing leaves your machine |

Plus a VS Code extension: history in the sidebar, prompt version history as a
git-style graph, and **Why is this file like this?** in the editor.

## Install

> **Status:** v0.1 is complete and dogfoods itself — this repository records
> its own development with it. Distribution via npm and the VS Code
> Marketplace is **not published yet**, so the source install below is the
> honest path today.

Requires **Node ≥ 20.19** and **git**.

```bash
git clone https://github.com/cbsshekhawat18-lab/gigai-chronicle.git
cd gigai-chronicle
corepack pnpm install
corepack pnpm build

# run it from anywhere…
node /path/to/gigai-chronicle/apps/cli/dist/main.js --help
# …or link it as `chronicle`
cd apps/cli && npm link
```

**VS Code / Cursor / Windsurf extension:**

```bash
cd apps/vscode && corepack pnpm package
# Cmd+Shift+P → "Extensions: Install from VSIX…" → gigaichronicle-vscode.vsix
```

## Quickstart (60 seconds)

```bash
cd your-git-repo

chronicle init                       # 3 questions, all skippable — or --yes
chronicle hooks install claude-code  # live capture, merged into .claude/settings.json
```

That's it. Work normally. Every prompt is now recorded — and every prompt
checkpoints your code, so you can always go back.

```bash
chronicle timeline          # what happened
chronicle sessions          # who/what did the work, with model badges
chronicle why src/auth.ts   # what was ASKED that made this file
chronicle doctor            # prove it's all local and intact
```

Already have history? Backfill it — idempotent, reads transcripts you already
have on disk:

```bash
chronicle import claude-code
```

## Commands

| Command | Purpose |
|---|---|
| `chronicle init [--yes] [--metadata-only] [--private-sessions]` | Initialize. Prints its complete footprint — 4 paths, named |
| `chronicle why <file> [--limit n]` | What was **asked** that made this file (ADR-0013) |
| `chronicle restore <evt> [--force]` | ⏪ Code time-travel to any prompt (ADR-0012) |
| `chronicle replay <session> [--at evt]` | Step through a session |
| `chronicle timeline [--since --until --branch --type…]` | The journey, filtered |
| `chronicle sessions [--provider --model]` | Sessions with provider/model badges |
| `chronicle prompt save\|list\|show\|versions\|diff` | Version control for prompts. `save --from-last` promotes the one you just typed |
| `chronicle inspect <id\|sha>` | The `git show` of Chronicle |
| `chronicle session privatize\|promote <id>` | Move a session off the shared record, or back |
| `chronicle import <provider>` | Backfill from existing transcripts |
| `chronicle hooks install\|uninstall <provider>` | Live capture (merges, never clobbers) |
| `chronicle doctor [--reindex] [--scan-secrets]` | Integrity, secret audit, zero-egress proof |
| `chronicle log <message>` | Manual capture — the universal floor |

**`--json` on every command** (`{"apiVersion":1,…}`) — the machine contract.
**Exit codes:** `0` ok · `1` failure · `2` usage · `3` not a Chronicle project.

## How it works

```
Your AI tool ──hooks──▶ Event Engine ──▶ .chronicle/  ──▶ Replay ──▶ CLI / VS Code
                        VALIDATE          (JSONL,           │
                        REDACT             plain text,      └─▶ why · restore
                        ENRICH             in your repo)
                        NORMALIZE
```

- **The store is a directory in your git repo.** Files are the API; git is the
  transport. That one choice is why there is no infrastructure to run.
- **The Event Engine is the only way in.** Secrets are redacted before the
  first byte reaches disk.
- **Checkpoints are git-native.** Every prompt snapshots your tree into a
  hidden ref (`refs/chronicle/ckpt/*`) in your own object store — never
  touching HEAD, your branches, or your history.
- **The index is a disposable cache.** Deleting `.chronicle/.cache/` is always
  safe.

Deep dive: [ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Privacy

Built for people who cannot send their prompts to a vendor.

- **Zero network by default** — and it proves it on demand:
  ```console
  $ chronicle doctor
  egress   zero-network (no endpoints configured, telemetry: none)
  ```
- **Never calls a model.** Never phones home. Never stores your file contents.
- **Secrets are redacted at capture**, irreversibly, before anything is
  written — including your own shapes via `capture.redaction.customPatterns`.
- **`--metadata-only`** records event shapes and timings with **no prompt
  text**, for repos where the words themselves are sensitive.
- **Sessions can be born private** (`--private-sessions`) or moved off the
  shared record any time (`chronicle session privatize`).
- **Never scores developers.** No leaderboards, no per-author metrics. Ever.

> ⚠️ **Understand the default:** your journey is **shared** — it commits with
> your repo and pushes with it. That's the point (a teammate clones and
> inherits the whole story), but it means your prompts are exactly as public
> as your repository. Read [docs/privacy.md](docs/privacy.md) before pushing
> anything sensitive.

## For teams

A teammate clones and immediately has the journey — no setup, no account:

```console
$ chronicle replay ses_01KXQGDTFD0GSQ92AWZ1E9XPJN
[07:44] you      one think, we give user only histry and version control system…
[09:40] you      check now
[09:40] tool     Bash → success
```

Prompts saved to the library travel the same way — review them in a PR like
any other file.

**Honest limit:** `why` and `restore` are **local-only**. Checkpoints live in
git refs that aren't pushed, so a fresh clone can replay the story but cannot
attribute lines. Replay is the team surface; `why` is your personal one.

## Documentation

| Doc | What it is |
|---|---|
| [GUIDE.md](docs/GUIDE.md) | The complete guide — what/why/how, install, workflows, FAQ |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | The technical spec — pipeline, event model, store format |
| [privacy.md](docs/privacy.md) | The privacy model, in full |
| [CAPTURE-SURFACES.md](docs/CAPTURE-SURFACES.md) | Every lawful capture mechanism, per tool, audited |
| [DELIVERY-SURFACES.md](docs/DELIVERY-SURFACES.md) | What we may write into another tool's territory |
| [PROVIDERS.md](docs/PROVIDERS.md) | Provider capability matrix — honest about fidelity |
| [SPEC-ROADMAP.md](docs/SPEC-ROADMAP.md) | The Chronicle Spec as an open standard |
| [VISION.md](docs/VISION.md) | The OpenTelemetry-for-AI-development endgame |
| [adr/](docs/adr/README.md) | Architecture Decision Records — every decision, and what it cost |

## Development

```bash
corepack pnpm install
corepack pnpm build        # turbo: all packages
corepack pnpm test         # every suite (network denied by the harness)
corepack pnpm typecheck
corepack pnpm lint         # architecture boundary checks
corepack pnpm test:scripts # repo tooling + cold-start budget
```

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) (DCO sign-off,
conventional commits, tests with every PR). Security reports:
[SECURITY.md](SECURITY.md).

## The promises

Local-first · plain text · zero network by default · never calls a model ·
never writes your git history · never scores developers · your data is yours.

**Free and open.** MIT for the code, CC-BY for the spec.
