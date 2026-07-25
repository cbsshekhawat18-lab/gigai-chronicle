<p align="center">
  <img src="https://raw.githubusercontent.com/cbsshekhawat18-lab/gigai-chronicle/main/assets/brand/banner.png" alt="Gigai Chronicle — git blame says who; chronicle why says what was asked" width="100%" />
</p>

# Gigai Chronicle — for VS Code, Cursor & Windsurf

> **Your AI development history — recorded in-repo, linked to git, replayable.**

Git records **what** changed. Gigai Chronicle records **what was asked** — the
prompts, the AI's responses, the tools it ran, the code it produced — as a
plain-text journey that lives inside your repository and travels by `git clone`
like everything else.

No account. No server. No network. It never calls a model.

---

## What it adds to your editor

### 🔍 Why is this file like this?
Right-click any file → **Chronicle: Why is this file like this?** `git blame`
tells you *you* wrote the line. Chronicle tells you **what you asked for** — the
prompt behind each change — and offers to put the code back to that moment.

### ▶️ Replay a session
Step through what actually happened: prompts, responses, tool runs, and commits
interleaved in order. Code review with the intent attached.

### 🕘 Sessions sidebar
Every AI session in the current repo, with **provider and model badges** — see
which AI did which work, grouped by day.

### 📚 Prompt version history
Your saved prompts as a **git-style graph** — versions, diffs in the native diff
editor, and a **Save prompt** button to keep the one that just worked (no
retyping).

### ⏪ One-click restore
Every captured prompt snapshots your working tree into a hidden git ref. Jump
back to how the code was at any prompt — always safety-checkpointed, so nothing
is ever lost.

### 📋 Copy context pack
Right-click any file → **Chronicle: Copy context pack**. Chronicle assembles the
prompts that shaped that file plus the decisions from those sessions into a
paste-ready brief — so your next AI session starts with what was already asked
and decided, instead of re-explaining the project. Pure assembly: it never calls
a model, it briefs the one you do.

### 📊 Dashboard: Commits, Files & Settings
The timeline is a workspace with tabs over one session. **Commits** and **Files**
show what the session actually changed — sourced from your real git history and
timed to the session's window (never fabricated). **Settings** is a read-only
view of your capture config and privacy posture — the dashboard only reads;
changing config stays a deliberate CLI action.

---

## Commands

| Command | What it does |
|---|---|
| **Chronicle: Why is this file like this?** | The prompt behind each change to a file |
| **Chronicle: Replay Session** | Step through a session |
| **Chronicle: Open Timeline** | The full journey |
| **Chronicle: Save a prompt to the library** | Keep a prompt you typed, versioned |
| **Chronicle: Copy context pack (brief my AI tool)** | The prompts + decisions that shaped a file, to your clipboard |
| **Chronicle: Import Codex sessions** | Backfill your `~/.codex` history for this repo |
| **Chronicle: Refresh** | Re-read the store |

Also on the right-click menu for any file (editor and Explorer).

## Setup

The extension **shows** your journey; the `chronicle` CLI **records** it. In a
git repo:

```bash
chronicle init                       # create the .chronicle/ store
chronicle hooks install claude-code  # capture live (merges into .claude/settings.json)
```

Then work normally — sessions appear in the sidebar. Already have history?
`chronicle import claude-code` backfills from transcripts you already have.

> Get the CLI and full docs:
> **[github.com/cbsshekhawat18-lab/gigai-chronicle](https://github.com/cbsshekhawat18-lab/gigai-chronicle)**

**Provider support today:** Claude Code (live capture) and **Codex** (import
your existing `~/.codex` history). Other tools are on the roadmap — the
extension shows their sessions as providers land.

## Works everywhere VS Code does

One codebase for **VS Code**, **Cursor**, and **Windsurf**. In untrusted
workspaces it runs read-only — it shows the journey (reading committed files is
what an editor does) but never captures.

## Privacy

- **Zero network by default** — `chronicle doctor` prints a proof on demand.
- **Never calls a model.** Never phones home. Never stores your file contents.
- **Secrets are redacted at capture**, before anything reaches disk.
- **`--metadata-only`** mode records shapes and timings with no prompt text.
- **Sessions can be private** and promoted deliberately.
- **Never scores developers.** No leaderboards, ever.

⚠️ By default your journey is **shared** — it commits and pushes with your repo.
That's the point (a teammate clones and inherits the story), but it means your
prompts are as public as your repo. See the
[privacy model](https://github.com/cbsshekhawat18-lab/gigai-chronicle/blob/main/docs/privacy.md).

## License

MIT. Free and open — [source & spec](https://github.com/cbsshekhawat18-lab/gigai-chronicle).
