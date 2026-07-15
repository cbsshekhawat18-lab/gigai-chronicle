# How Chronicle handles secrets and privacy

> User-facing draft (M5). This page backs every claim in the marketing
> trust block ([HOMEPAGE.md](HOMEPAGE.md)) with the mechanism behind it.
> Constitutional basis: [ARCHITECTURE.md §2 law 7, §9, §18](ARCHITECTURE.md#2-design-laws).

## Secrets are redacted before they ever reach disk

Everything a provider captures passes through the Event Engine, and
**redaction is a mandatory pipeline stage that runs before the first byte is
written**. There is no configuration in which raw captured text skips it.

Three detectors run on every string, however deeply nested:

1. **Known token formats** — AWS access keys, GitHub/Slack tokens, Google
   API keys, JWTs, private-key blocks. The pack is data-driven and grows by
   small reviewable PRs with corpus tests.
2. **Workspace `.env` values** — anything you keep in `.env`/`.env.local`
   is a secret *by location*, whatever it looks like. Values are read into
   process memory only, used solely for match-and-replace at capture time,
   and are never written, logged, or included in any report.
3. **An entropy heuristic** — long, high-entropy, multi-character-class
   tokens that look machine-generated. Deliberately conservative: redaction
   is irreversible, so a false positive destroys your content. Chronicle
   IDs, git hashes, URLs, paths, and timestamps are explicitly excluded, and
   a plain-prose false-positive corpus is tested as strictly as the catch
   corpus.

What lands on disk is an irreversible marker:

```
[REDACTED:aws-access-key-id:88ba234e]
```

The 8-hex suffix is a hash prefix of the removed value — the same secret
always produces the same marker (so you can trace where one leaked from)
but the secret cannot be recovered from it.

## Audit it yourself

- `chronicle doctor --scan-secrets` re-checks everything already stored
  against the current pattern pack. Findings report the **kind and
  location only, never the content** — the report is safe to paste into an
  issue.
- `chronicle doctor` prints the complete egress configuration. By default
  that is: **no endpoints, no telemetry — zero network**. The claim is
  test-enforced in CI (every test run executes with TCP/DNS/HTTP denied).
- The store is plain JSONL in your repo: `grep -r "REDACTED" .chronicle/`
  shows you every redaction ever made.

## The red line (enforced in CI)

A test suite pushes a synthetic secret of every known class — plus a
planted `.env` value — through the full pipeline and then greps the raw
store files for the plaintext. **If any secret reaches disk, the build
fails.** That test failing blocks every release.

## What Chronicle never does

Never calls a model. Never phones home. Never stores your file contents.
Never writes your git history (one opt-in commit trailer excepted). Never
ranks developers. Cloud sync, if you ever enable it (Phase 4), is opt-in,
tiered, and rejects file contents server-side.
