# gigaichronicle-vscode

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
