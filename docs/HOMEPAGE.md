# Gigai Chronicle — Homepage Copy

> Pain-first, not feature-first. Every section leads with a moment the
> developer has personally lived; features appear only as the resolution of a
> pain. No generic AI language ("supercharge", "unleash", "revolutionize" are
> banned). Positioning per [PHASE-0.md §3](PHASE-0.md#3-product-positioning) v2:
> category **AI Development History**, hero capability **Replay**.
>
> Status: `v2 draft copy — 2026-07-14` · This is website copy + structure,
> not HTML.

---

## Hero

# Your AI wrote half of this codebase. Do you remember why?

**Build software with AI. Never lose the journey.**

Gigai Chronicle records your AI-assisted development history inside your
repository — every session, prompt, and accepted change, linked to your
commits — and lets you **replay** it.

`[ Install for VS Code ]`  `[ npm i -g @gigaichronicle/cli ]`

*Local-first. Plain text. No account. No cloud. Works with your AI tools —
starting with Claude Code.*

---

## The pains (section: "You know this feeling")

**Monday, 9:12 AM.**
The agent ran for three hours on Friday. It tried something with the queue
consumer, hit a wall, tried something else. You know because you were there.
The terminal scrollback is gone, and so is your weekend memory of it. You
re-explain the whole context from scratch — to the same tool that lived
through it.

**The prompt that finally worked.**
Forty minutes of iterating and you found the wording that made the flaky
migration test rewrite come out right. That prompt now exists in exactly one
place: a closed terminal buffer. Next month, on the next migration, you'll
pay the forty minutes again.

**`git blame` says it was you.**
It wasn't, exactly. The middleware rewrite came out of a session where you
told the model to "simplify" — and its response even warned about the dropped
null-check, which nobody read again after the diff looked clean. The incident
is today. The reasoning lives in a chat that no longer exists.

**The 4,000-line PR.**
Generated in an afternoon, reviewed for a week. The description says
"refactors auth." What was asked, what constraints were given, what
alternatives got rejected — none of it made the PR. Your reviewer isn't
reviewing the change; they're reverse-engineering the intent *and* the code.

**"Which session broke prod?"**
You can bisect commits. You cannot bisect conversations — they were never
kept.

---

## The turn (section: "Git remembers what. Nothing remembers why.")

Git records what the code became. The other half of modern development — what
you asked, what the AI proposed, what you rejected, what you accepted, and
why — evaporates the moment the terminal closes.

Gigai Chronicle keeps that half. In your repo. In plain text. Next to the
commits it explains.

---

## How it works (section: three steps, zero ceremony)

1. **Install and init.** `chronicle init` finds the AI sessions already on
   your machine and imports them. Your first timeline isn't empty — it's your
   own last month.
2. **Keep working. That's it.** Capture is passive: your AI tool's own hooks
   stream events into `.chronicle/` — redacted for secrets before they ever
   touch disk. No new commands to learn, no workflow tax, nothing to remember.
3. **Replay when it matters.** `chronicle replay` steps through any session —
   the conversation, the tool runs, the file changes, and the commits,
   interleaved. Monday-you watches Friday-you work. The reviewer reads the
   intent. The incident gets forensics instead of archaeology.

```
$ chronicle replay ses_01J2X9…
[10:32] you      Add refresh-token rotation to the auth middleware
[10:33] claude   Plan: 1) rotate on refresh, 2) revoke family on reuse…
[10:35] tool     edit src/auth/refresh.ts (+41 −7)
[10:41] you      accepted 2 files
[10:58] git      commit 9fc1b2a "auth: rotate refresh tokens"  ← linked (exact)
```

And because `.chronicle/` is committed, **the journey travels with the
repo** — every clone, every branch, every teammate, no server involved.

---

## Trust (section: "What it never does")

This category only works if you can trust it, so the guarantees are
structural, not promises:

- **Never calls a model.** Chronicle records your AI work; it does none of
  its own.
- **Never phones home.** Zero network by default — provable: `chronicle
  doctor` prints your complete egress configuration (it's empty).
- **Never touches your code or your git history.** Read-only, always.
- **Never scores developers.** No leaderboards, no per-person metrics. Ever.
- **Never locks you in.** Plain Markdown/JSON in your repo, under an open
  spec (CC-BY). If we disappear in 2031, `cat` and `grep` still work in 2036.
- **Secrets are redacted before first write** — not after, not on upload.
  Before.

---

## Works with (section: honest, per-tool)

**Claude Code** — full live capture + history import, today.
**Codex CLI, Gemini CLI** — next; import first, live capture following.
**Cursor, Copilot & the rest** — manual capture today; deeper support as
vendors expose surfaces (we publish exactly what each tool allows —
[capability matrix](PROVIDERS.md)).

Chronicle is provider-neutral by design: an open event format any tool can
emit. One journey, whatever you build with.

---

## Closing CTA

# Stop losing the why.

Your next session is about to evaporate. The one after that doesn't have to.

`[ Install for VS Code ]`  `[ chronicle init ]`

*Free forever locally · MIT · Open spec*

---

## Copy discipline (for whoever builds the page)

- Lead every section with a lived moment, never a feature name. The feature
  is always the *answer* to a pain already on screen.
- Concrete beats generic: "closed terminal buffer," "4,000-line PR,"
  "Monday, 9:12 AM" — never "boost productivity" or "AI-powered insights."
- The words **Prompt Manager / Prompt Versioning / PromptOps do not appear**
  anywhere on the site (Phase-0 §3 v2). The words used for the category:
  **AI Development History**; for the capability: **replay**.
- Vendor names appear only in the "Works with" section, always plural, never
  in the hero — the promise is tool-agnostic (revision item 1).
- Every claim in the Trust section must link to its proof (doctor output,
  CI network-denial badge, the spec).


---

*Brand assets (canonical): `assets/brand/logo.png` (wordmark), `assets/brand/icon.png` (+ 512/256/128 sizes). Marketplace icon and README hero are generated from these — regenerate sizes with `sips -z <n> <n> assets/brand/icon.png --out …`.*
