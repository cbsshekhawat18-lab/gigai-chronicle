# Gigai Chronicle — Delivery Surface Audit

> Every mechanism for **writing** Chronicle's projections into a place an AI
> tool already reads — classified by how well the target is known. The
> outbound counterpart of [CAPTURE-SURFACES.md](CAPTURE-SURFACES.md), and a
> precondition of implementing [ADR-0016](adr/0016-delivery-surfaces-and-the-knowledge-projection.md).
>
> Status: `PARTIAL 2026-07-17` — one target verified, one deferred pending
> vendor-doc verification. Formats churn: re-verify before each delivery
> release.

---

## 0. Why this document is separate from CAPTURE-SURFACES

CAPTURE-SURFACES audits **observing**: reading files a vendor tool wrote to
the user's disk. Its legal frame is about reading — safe harbour, format
parsing, no circumvention.

Delivery is the opposite act: **we write into a directory another tool owns.**
Different risk, different rules. Nothing here is about access; everything here
is about restraint.

## 1. Classification rubric

| Class | Meaning |
|---|---|
| 🟢 **Verified** | Behavior confirmed by direct observation or vendor documentation we have read. Safe to implement. |
| 🟡 **Believed** | We think we know the format, but have not verified it against a source. **Not implementable** — "we recall it works this way" is not an audit (IMPLEMENTATION-MODE: never invent behavior, including a third party's). |
| 🔴 **Refused** | Technically possible, rejected by policy. |

**The bar is deliberately high.** PHASE-0 §1.3 names vendor-format churn as
the hazard that breaks integrations on every tool release. Inbound, a wrong
guess yields a capture gap we report. Outbound, a wrong guess **corrupts a
file another tool depends on**. The asymmetry is why 🟡 does not ship.

## 2. Summary matrix

| # | Target | Tool | Mechanism | Class |
|---|---|---|---|---|
| 1 | `CLAUDE.md` | Claude Code | Repo-root file, loaded into context automatically | 🟢 Verified |
| 2 | `.claude/commands/*.md` | Claude Code | Markdown file per custom slash command | 🟡 Believed |
| 3 | `AGENTS.md` | Codex CLI, others | Repo-root instructions file | 🟡 Believed |
| 4 | `.cursor/rules/*.mdc` | Cursor | Always-on rule files | 🟡 Believed |
| 5 | Vendor config beyond our own keys | any | Editing settings we did not write | 🔴 Refused |
| 6 | Anything encoded, minified, or encrypted | any | — | 🔴 Refused (ADR-0016) |

## 3. The targets

**3.1 `CLAUDE.md` — 🟢 Verified.** Claude Code loads the repository's
`CLAUDE.md` into the session's context automatically, without the user asking.
This is verified by direct observation rather than recall: a Claude Code
session working in this repository receives the file's contents in its system
context, labelled as codebase instructions. That is first-hand evidence of the
behavior we would be relying on.

Consequences for delivery: it is the highest-value target (zero friction — a
teammate who pulls simply *has* it) and the highest-risk (it is loaded, in
full, into every session; noise there is a tax on every prompt, forever).
`GENERATED_MARKER` (§7.2 rule 2) applies: Chronicle writes it only if absent
or already generated, and never touches a hand-written one.

**3.2 `.claude/commands/*.md` — 🟡 Believed. Does NOT ship.** We believe a
markdown file here becomes an invokable slash command, which would make the
prompt library reachable as `/auth-review` — the whole point of `prompt sync`.
But we have not read the vendor documentation for it: the exact filename→name
mapping, frontmatter handling, precedence between project and user scope, and
argument passing are all unverified. This repository's zero-network law (design
law 7) means it cannot be verified from inside a working session.

**To promote to 🟢:** read Claude Code's published documentation on custom
slash commands and record here, with a link and a date, the filename mapping,
the frontmatter contract, and the scope-precedence rules. Until then
`prompt sync --tool claude-code` is not implementable.

**3.3 `AGENTS.md` — 🟡 Believed.** A convention several tools read. Unverified
per-tool; same bar as 3.2.

**3.4 `.cursor/rules/*.mdc` — 🟡 Believed.** Cursor's rule files are
always-on context rather than invokable commands, so a prompt library maps to
them poorly even if the format were verified. Low priority.

**3.5 Vendor config we did not author — 🔴 Refused.** We merge our own keys
into `.claude/settings.json` for hook installation (CAPTURE-SURFACES §2.1) and
nothing more. Rewriting a user's editor settings to suit us is not a delivery
mechanism; it is a liberty.

**3.6 Encoded / encrypted payloads — 🔴 Refused by policy.** A file that is
auto-loaded by every AI **and** unreadable by humans is an unreviewable
prompt-injection channel: a reviewer seeing an opaque blob in a PR cannot know
it says *"ignore prior instructions"*. Plain text is the control that makes
`.chronicle/` auditable in a diff. Reasoning in full: ADR-0016 §Context.

## 4. Rules binding every target

From [ADR-0016](adr/0016-delivery-surfaces-and-the-knowledge-projection.md):
plain text always · marker-guarded · merge-never-clobber · explicit (never a
side effect of capture) · idempotent · reversible · **fails to a reported
no-op, never a corrupt write** · never leaves the repo · never launders a
private session or a metadata-only store into a shared file.

## 5. Sources

| Target | Source | Verified |
|---|---|---|
| `CLAUDE.md` | Direct observation: contents delivered into a Claude Code session's context in this repository | 2026-07-17 |
| everything else | — | **not yet** |
