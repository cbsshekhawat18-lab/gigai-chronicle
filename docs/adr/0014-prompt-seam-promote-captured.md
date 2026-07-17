# 0014 — The prompt seam: promote a captured prompt into the library (founder decision)

- Status: Accepted
- Date: 2026-07-17
- Relates: [ADR-0011](0011-prompt-library-pulled-forward.md) (the library this
  feeds), [ADR-0008](0008-sqlite-driver.md) (why these lookups are log-based,
  not index-based), [PHASE-0 §1.1](../PHASE-0.md#11-the-problem-stated-precisely) (P1),
  [ARCHITECTURE §7.2](../ARCHITECTURE.md) (rule 5 — blob spill)

## Context

v0.1 ships two prompt worlds that never touch:

| | Fed by | Holds |
|---|---|---|
| **The log** (`.chronicle/sessions/`) | capture, automatically | every prompt you typed |
| **The library** (`.chronicle/prompts/`) | `chronicle prompt save`, by hand | the curated few |

To put a prompt that worked into the library you had to **retype it**. That
is precisely the manual hoarding P1 describes — *"developers keep prompt
collections in Notes, gists, and README snippets — manual, lossy versions of
P1"* (PHASE-0 §1.2). Chronicle shipped the filing cabinet and left the user
carrying paper to it.

The founder hit this directly during dogfooding: after typing many prompts,
the version history panel still showed v2 and looked **stuck**. It was
correct — nothing had been saved — but the expectation was that typing
prompts feeds the library. When the person who designed the library expects
that, every user will.

## Decision

Join the two worlds, keeping the library curated.

- **Core lookups** (`prompts/from-capture.ts`): `capturedPrompts`,
  `capturedPromptByEvent`, `lastCapturedPrompt`, `suggestSlug`.
- **EventLog-based, never index-based.** The extension reads the store over
  pure fs and never loads SQLite (ADR-0008), so an index-backed lookup could
  not be shared with it. One implementation serves CLI and editor.
- **CLI:** `chronicle prompt save <slug> --from-last | --from-event <evt> |
  --from-session <ses>`. `--from-last` is the point of the whole ADR: *save
  the one I just typed*.
- **VS Code:** a `chronicle.savePrompt` command, surfaced as a button on the
  Sessions view. It picks a captured prompt, then asks **where it lands** —
  new prompt, or a new version of an existing one. That second step is
  deliberate: it makes the versioning model *visible* instead of implied.
- **Provenance is free.** A promoted prompt records `sourceSession`
  automatically; the library entry points back at the session that produced
  it.
- **Spilled bodies resolve.** `text` is `textOrBlobSchema` — past 64KB it is
  a `{$blob}` ref (§7.2 rule 5). Treating that as "no text" would silently
  drop exactly the long, carefully-built prompts a library exists for, so the
  sidecar is read.
- **No new event types.** The library stays curated Markdown synced by git;
  the taxonomy freeze holds, as in ADR-0011 and ADR-0013.

## Consequences

- P1 is served end to end: the prompt that worked reaches the library without
  passing through the keyboard twice.
- **Promotion stays deliberate — the library must not become the log.** There
  is no auto-save; a library where every prompt lands is a second event log
  with worse ergonomics, and curation is the entire value. What this ADR
  removes is the *retyping*, not the *choosing*.
- **Private sessions are included in the picker, on purpose.** Promotion is a
  local act by the person who wrote the prompt, and the file it produces is
  what they then choose to commit. The privacy boundary stays where the
  social-privacy model already put it — at the commit, not at the picker.
- The "Save as" step teaches versioning by doing: choosing an existing slug
  shows `v2 → v3` before it happens, which is the exact confusion that
  prompted this ADR.
- Sharing needs no new machinery: A saves, commits, pushes; B pulls and has
  the prompt with full version history. Verified against a real clone. What
  is still missing is *reach* — B must still find and paste it. That is a
  separate decision (`prompt sync` into each tool's native format), not
  smuggled in here.

## Alternatives rejected

- **Auto-promote every captured prompt.** Turns the library into a noisier
  copy of the log and destroys curation — the one thing the library adds.
  Rejected.
- **Index-backed lookups.** Faster, but unusable from the extension, which
  cannot load the native SQLite module (ADR-0008). One shared implementation
  beats two. Rejected.
