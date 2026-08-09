# Troubleshooting

Each entry: **symptom → cause → solution → verify.**

## "not a chronicle project (no .chronicle directory found)"
- **Cause:** you're not inside an initialized repo.
- **Solution:** `cd` into your git repo and run `chronicle init`.
- **Verify:** `chronicle doctor` prints the store footprint.

## Project Memory is empty (`memory list` / panels show nothing)
- **Cause:** memory is derived and hasn't been built yet.
- **Solution:** `chronicle memory rebuild`.
- **Verify:** `chronicle memory stats` shows a non-zero count.

## `risk` / `why-not` / `impact` say "no history" / risk unknown
- **Cause:** these need file attribution, which comes from capture checkpoints
  (created as you work with hooks). A file with no captured history has no
  signals — Chronicle says *unknown, not zero*, on purpose.
- **Solution:** work with `chronicle hooks install <provider>` running, or
  `chronicle import <provider>` to backfill; then `chronicle memory rebuild`.
- **Verify:** `chronicle why <file>` lists shaping prompts.

## `bootstrap` / `project context` is thin or empty
- **Cause:** little captured history yet, or memory not rebuilt.
- **Solution:** `chronicle memory rebuild`; capture more sessions.
- **Verify:** `chronicle onboarding-test` shows the coverage gaps to fill.

## Provider not detected / `import` finds nothing
- **Cause:** the provider's transcripts aren't where Chronicle looks, or the repo
  path doesn't match the recorded working directory.
- **Solution:** run `import` from the repo root; use `--from <dir>` to point at an
  archive. Supported today: `claude-code` (live), `codex` (import).
- **Verify:** `chronicle sessions` lists the imported sessions.

## Hooks not capturing
- **Cause:** hooks not installed, or installed at the wrong scope.
- **Solution:** `chronicle hooks install claude-code` (add `--user` for user scope).
- **Verify:** work a bit, then `chronicle timeline` shows new events.

## Extension shows nothing / stale data
- **Cause:** the window predates a new build, or the store changed on disk.
- **Solution:** reload the window; click **Refresh** in the dashboard.
- **Verify:** the Sessions / Project Memory / Dev Intelligence panels populate.

## Memory looks noisy or over-attributed
- **Cause:** extraction is deterministic and conservative, but quality tracks
  capture granularity — one giant session that touched everything makes
  file-scoped views broader than many small, focused sessions would.
- **Solution:** capture in focused sessions; `chronicle memory rebuild` after the
  fix. `chronicle memory verify` flags integrity problems.
- **Verify:** `why-not`/`risk` on a file show the expected, deduped signals.

## "unresolved conflicts" in `memory verify`
- **Cause:** two firm decisions on the same subject disagree and neither clearly
  supersedes the other — by design, Chronicle reports rather than picks.
- **Solution:** `chronicle memory conflicts` to see them; make the intended
  decision explicit in a later session, then rebuild.
- **Verify:** the conflict count drops.

## Corrupted cache / want a clean derived state
- **Cause:** derived state is disposable.
- **Solution:** delete `.chronicle/.cache/`; `chronicle memory rebuild`. The event
  history (`.chronicle/sessions/`) is the source of truth and is untouched.
- **Verify:** `chronicle doctor` reports integrity OK.

## Performance on a large history
- **Cause:** some intelligence commands diff git history per checkpoint.
- **Solution:** scope with `--task`/`--file`/`--budget`/`--since`; prefer the
  persisted memory store (built by `memory rebuild`) which the read commands use.

Still stuck? `chronicle doctor` is the diagnostic anchor, and the source of truth
is always the plain-text `.chronicle/` store.
