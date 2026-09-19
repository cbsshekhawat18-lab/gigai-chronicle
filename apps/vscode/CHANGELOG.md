# gigaichronicle-vscode

## 0.5.0

**Chronicle starts itself.** Open a git repo you already work on with an AI
tool and the extension begins recording it. Anywhere else it asks once —
**Start recording** / **Not now** / **Never here** — and remembers your answer
for that workspace. `chronicle.autoStart` (`auto` · `ask` · `off`) settles it
either way. Untrusted workspaces and non-git folders are never written to.

- New command: **Chronicle: Start recording this project**.
- The sidebar now offers to start a project instead of suggesting a backfill
  for a project that does not exist yet.
- A project started mid-session updates live — no window reload.
- Starting creates `.chronicle/` and wires the capture hooks into
  `.claude/settings.json`, exactly as `chronicle init` does. Everything stays
  on your machine.

## 0.1.0

### Minor Changes

- M10 — The Face. VS Code/Cursor/Windsurf extension: phased activation,
  Sessions TreeView (live via debounced watcher, honesty tooltips), the one
  Timeline webview (React+Zustand, snapshot/patch protocol v1, CSP-locked,
  theme-native) rendering Replay Engine frame deltas with fidelity badges and
  gap warnings. Packaged .vsix is platform-independent: the extension reads
  the store via pure-fs EventLog+Replay — the native index module is provably
  absent from the bundle.

### Patch Changes

- d225160: M1 — Foundations: monorepo scaffold (pnpm + Turborepo + TypeScript ESM),
  3-OS CI with network-denial test harness, architecture boundary lint
  (dependency direction + provider pipeline rule), governance (MIT, DCO,
  conventional commits), ADR-0001…0006 ratifying decisions D6–D11, performance
  budgets as data, path-edge fixtures. No runtime behavior yet — packages
  export identity only until their owning milestones land.
- Updated dependencies [d225160]
- Updated dependencies [1af3e9d]
- Updated dependencies [5536b71]
- Updated dependencies [3b31b1b]
- Updated dependencies [2fa51ae]
- Updated dependencies [2586087]
- Updated dependencies [b2b2879]
- Updated dependencies [d6250b5]
- Updated dependencies [dcd33b3]
  - @gigaichronicle/schema@0.1.0
  - @gigaichronicle/core@0.1.0
  - @gigaichronicle/ui@0.0.1
