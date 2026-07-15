# Gigai Chronicle

> **Build software with AI. Never lose the journey.**

Git records what changed. Gigai Chronicle records how AI helped create those
changes — an append-only, plain-text event log of your AI-assisted
development journey, living inside your repository, with tools to capture,
**replay**, and understand it.

**Status: pre-release — building [Milestone M1](docs/issues/README.md) of the
MVP.** The architecture is frozen and documented; nothing here is usable yet.

## The documentation set (source of truth)

| Doc | What it is |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | The frozen v2 technical spec — pipeline, ChronicleEvent model, Replay Engine, `.chronicle/` format |
| [docs/PHASE-0.md](docs/PHASE-0.md) | Approved product validation, positioning, MVP scope |
| [docs/CAPTURE-SURFACES.md](docs/CAPTURE-SURFACES.md) | Audit of every lawful capture mechanism per AI tool |
| [docs/PROVIDERS.md](docs/PROVIDERS.md) | Official provider capability matrix |
| [docs/SPEC-ROADMAP.md](docs/SPEC-ROADMAP.md) | The Chronicle Spec as an open standard (v1–v5) |
| [docs/VISION.md](docs/VISION.md) | The OpenTelemetry-for-AI-development endgame |
| [docs/issues/](docs/issues/README.md) | The 10 MVP milestones and their epics |
| [docs/adr/](docs/adr/README.md) | Architecture Decision Records |
| [docs/IMPLEMENTATION-MODE.md](docs/IMPLEMENTATION-MODE.md) | The engineering operating contract |

## Development

```bash
corepack pnpm install
corepack pnpm build        # turbo: all packages
corepack pnpm test         # package test suites (network-denied by harness)
corepack pnpm test:scripts # repo tooling tests
corepack pnpm typecheck
corepack pnpm lint         # architecture boundary checks
```

Contributions: see [CONTRIBUTING.md](CONTRIBUTING.md) (DCO, conventional
commits, tests with every PR). Security reports: [SECURITY.md](SECURITY.md).

## The promises (constitutional — see the docs)

Local-first, plain text, zero network by default, never calls a model, never
writes your git history, never scores developers, MIT code + CC-BY spec.
