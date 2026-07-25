# Roadmap

What's shipped, what's next, and what's further out. This is the **product**
roadmap; the open-standard side lives in [SPEC-ROADMAP.md](SPEC-ROADMAP.md).

Honesty rule (same as the product): nothing here is described as done until it
ships. Everything below "Shipping today" is intent, not a promise of dates.

---

## Shipping today — v0.1.x

The MVP, live on npm, VS Code Marketplace, and Open VSX.

- `chronicle why / restore / replay / timeline / sessions / doctor / import`
- Live capture via hooks; git-native checkpoints (`refs/chronicle/ckpt/*`)
- Redaction at capture, `--metadata-only`, private sessions
- Prompt library: `save --from-last · list · show · versions · diff`
- VS Code: **one** Timeline webview (Conversation stream) + a Sessions tree in
  the sidebar + prompt versions in the native diff editor + *"Why is this file
  like this?"* in the editor

---

## Next — v0.1.1: prompt evolution

Comes straight from launch-week feedback (thank you Vivek, Muammer). Today you
can diff *saved library* prompts; you can't yet diff the *captured* prompts you
actually typed to the agent while iterating. That delta — attempt 2 → attempt 3
— is where the learning is. The diff engine (`unifiedDiff`) and the checkpoint
chain already exist, so this is mostly plumbing.

- [x] `chronicle diff [evtA] [evtB]` — unified diff between two captured
      prompts (no args = the last two you typed) *(landed for v0.1.1)*
- [x] `chronicle why <file> --evolution` — show how the ask changed across the
      prompts that shaped that file *(landed for v0.1.1)*
- [x] `chronicle prompt save --from-event <id> | --from-session <id>` — promote
      *any* captured prompt into the library, not only `--from-last` *(already
      shipped in v0.1.0)*
- [x] VS Code: pick two prompts in the Timeline → **Compare** — opens the two
      you typed in the native diff editor *(landed for v0.1.1)*

**The prompt lifecycle** *(also landed for v0.1.1)* — the library becomes a
real workflow, not just storage:

- [x] `prompt use <slug>[@v] [--copy]` — get a saved prompt into your hands
- [x] **● used / ○ saved for later** — derived from real capture (a prompt
      counts as used only when capture *observed* it submitted; there is no
      counter to click), with per-version counts in `prompt versions`
- [x] `prompt save --note "why"` — per-version commit messages
- [x] `prompt revert <slug> <v>` — append-only rollback; nothing rewritten
- [x] `prompt compare <a[@v]> <b[@v]>` — diff across different prompts
- [x] Dashboard + sidebar: status badges, **▷ use** (clipboard), **⇄ compare**
      between library prompts in the native diff editor

---

## v0.2 — The Dashboard *(landed for v0.1.1)*

A single, local, read-only workspace for your journey — the natural next step
after the one Timeline webview. **It respects every current law:** it renders
the Replay Engine's projections (never raw provider data), stays entirely
local, calls no model, and is CSP-locked. It is a *view* over the plain-text
store, not a new store.

**Layout (as shipped)**

- **Left nav rail:** Timeline · Sessions · Prompts · Commits · Files ·
  Settings — plus a live Recent Sessions list
- **Session header:** provider + model badges · turns · tool runs · **files
  touched** · fidelity · gaps — every number read from the ReplayFrame
- **Tabbed views over one session:** Conversation · Tools · Git · Files ·
  **Gaps** (Gaps surfaces missing capture honestly, per the fidelity model)
- **In-stream affordances:** ⏪ restore code, and **⇄ compare** two prompts
  straight into the native diff editor

**Two honest deviations from the mockup** (the store doesn't hold the data, so
the UI doesn't invent it):

- **No "tokens used" meter.** Chronicle captures no token counts; a number we
  can't source is a number we won't show.
- **No "Knowledge" tab yet.** There is no knowledge store to back it. It stays
  in *Later* until there is.

**Constraints that don't move**

- One workspace, still the ONE-webview discipline (§15.2) — tabs, not a fleet
  of panels
- No developer scoring, ever — counts describe *work*, never *people*
- Deleting `.chronicle/.cache/` stays safe; the dashboard is disposable UI over
  a durable store

> Reference mockup lives in `docs/design/` — see
> [dashboard-mockup](design/README.md).

---

## v0.2 — in progress

- [x] **Codex CLI provider** — `chronicle import codex` reads your existing
      Codex rollouts (`~/.codex/sessions/`), scoped to the current repo by each
      session's recorded `cwd`, and maps prompts, responses, and tool calls
      into the same store. Tier-2 import today (conversation + tools);
      validated on real rollouts with zero drift. Live hooks + file events are
      the next step up its PROVIDERS.md row.
- [x] **Knowledge extraction** — `chronicle knowledge` surfaces the decisions
      & TODOs buried in your sessions (prompts *and* the agent's responses),
      rule-based and model-free, each with its own source line + confidence.
      Deliberately conservative — an honest index into the record, not a guess.
- [x] **Context Pack** — `chronicle context <file>` (and VS Code *"Copy context
      pack"*) assembles a paste-ready brief from your own history: the prompts
      that shaped a file + the decisions from those sessions. The pain in AI
      coding is context loss; Chronicle already captured the answer. Pure
      assembly — Chronicle never calls a model, it briefs the one you do.

## Later

- **Attempt clustering** — detect near-identical consecutive prompts and group
  them as "3 attempts at one intent". The real insight nobody else has; kept
  here deliberately because "same intent" is genuinely ambiguous and shouldn't
  be over-promised.
- **Team attribution** — `why`/`restore` are local-only today (checkpoints
  aren't pushed). A pushable, opt-in checkpoint channel would make attribution
  survive a fresh clone.
- **More providers** — the capability matrix in [PROVIDERS.md](PROVIDERS.md)
  is the honest scoreboard; each new first-party provider raises a row.
- **Spec v2 ecosystem** — see [SPEC-ROADMAP.md](SPEC-ROADMAP.md) and
  [VISION.md](VISION.md).

---

Have a request? Open an issue — launch-week feature asks are already shaping
v0.1.1.
