---
"@gigaichronicle/core": minor
"@gigaichronicle/cli": minor
"@gigaichronicle/schema": patch
---

M6 — Who Am I. Core: the three-identity model — `runInit` (mint `prj_`,
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
