# Security Policy

Gigai Chronicle's entire value proposition rests on trust: it records
developers' AI sessions — potentially years of them — on their own disks.
Security reports are treated accordingly.

## Reporting a vulnerability

**Do not open a public issue.** Report privately:

1. Preferred: GitHub **private vulnerability reporting** on this repository
   (Security → Report a vulnerability), once the repository is public.
2. Email: **tech@xper8.com** with subject `[SECURITY] …`.

You will get an acknowledgment within 72 hours and a resolution or a written
plan within 14 days. Coordinated disclosure is welcome; credit is given
unless you prefer otherwise.

## Scope — what counts as a vulnerability here

Beyond the usual (RCE, injection, dependency compromise), this project treats
the following as **security bugs, severity high**, because they break
constitutional promises ([ARCHITECTURE.md §18](docs/ARCHITECTURE.md#18-security-model)):

- Any secret reaching disk unredacted past the Event Engine.
- Any network egress in a default configuration (design law: zero network).
- Any path by which a cloned repository's `.chronicle/` data causes code
  execution or unsanitized rendering (prompt-injection boundary).
- Any write to the user's git history outside the single opt-in trailer.

## Fixture policy (contributors)

**No real credentials, tokens, or user transcripts in fixtures — ever.**
All fixture secrets are synthetic (documented fake formats); all fixture
transcripts are synthetic or scrubbed and two-pass reviewed (automated scan +
manual checklist). A fixture PR violating this is closed and the history
scrubbed.

## Supply chain

Core targets < 10 runtime dependencies; the lockfile is committed; releases
will be published with npm provenance; CI runs dependency review. See
[ARCHITECTURE.md §18](docs/ARCHITECTURE.md#18-security-model).
