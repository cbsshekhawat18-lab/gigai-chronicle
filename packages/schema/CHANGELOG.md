# @gigaichronicle/schema

## 0.1.0

### Minor Changes

- 1af3e9d: M2 — The Contract: Chronicle Spec v1 draft 0. ChronicleEvent envelope with
  read-forward rules (SCHEMA_AHEAD vs INVALID, unknown fields preserved), the
  20-type Phase-1 core taxonomy as a data registry (payload schemas, session
  bindings, visibility classes), `Ext.<provider>.<Name>` extension namespace,
  prefixed-ULID identifiers (dependency-free, WebCrypto), `.chronicle/config.json`
  schema, result-style parse API, 22 generated JSON Schema artifacts
  (drift-guarded), and a 45-fixture conformance corpus.

### Patch Changes

- d225160: M1 — Foundations: monorepo scaffold (pnpm + Turborepo + TypeScript ESM),
  3-OS CI with network-denial test harness, architecture boundary lint
  (dependency direction + provider pipeline rule), governance (MIT, DCO,
  conventional commits), ADR-0001…0006 ratifying decisions D6–D11, performance
  budgets as data, path-edge fixtures. No runtime behavior yet — packages
  export identity only until their owning milestones land.
- 2586087: M6 — Who Am I. Core: the three-identity model — `runInit` (mint `prj_`,
  scaffold, append-never-clobber `.gitattributes`, record `ProjectCreated`),
  repository fingerprint per ADR-0009 (normalized remotes ∥ root commits,
  pinned conformance digest, shallow-aware; foreign-repo check compares roots
  so fork remotes never false-alarm), `openWorkspace` front door
  (`WorkspaceMoved` detection, ≤1/day `ProjectOpened` throttle, foreign flag),
  and a store hardening found by fuzzing: `EventLog.append` validates the
  serialized line, closing a JSON round-trip asymmetry. CLI: `chronicle init`
  (≤3-question interview, `--yes`, TTY-aware) and identity-aware `status`.
  Schema: additive optional `capture.mode` ("full" | "metadata") storing the
  init-time high-sensitivity choice (resolved decision #3).
