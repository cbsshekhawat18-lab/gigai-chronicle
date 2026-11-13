# 0018 — Capture hooks are quiet without the CLI; "live" means the CLI resolves

- Status: Proposed (implemented on `fix/publish-capture-hardening`; accept on merge)
- Date: 2026-11-13
- Relates: [ADR-0012](0012-git-native-code-checkpoints.md) (capture runs per
  prompt), [CAPTURE-SURFACES §2.1](../CAPTURE-SURFACES.md) (fire-and-forget
  hook contract), [ARCHITECTURE §14](../ARCHITECTURE.md#14-cli-design)

## Context

Live capture is three things, and until now we only checked the first two:

1. **Intent:** `capture.providers.claude-code: "auto"` in `.chronicle/config.json`.
2. **Wiring:** hooks in `.claude/settings.json` that run
   `chronicle capture claude-code --event <Event>`.
3. **A `chronicle` on PATH** for those hooks to run.

The VS Code extension writes (2) when it starts a project, but it does not
ship the CLI. `wireCapture()` and `captureState()` reported `live: true` from
(2) alone, so a user who installed only the extension saw "capture is live",
and nothing was recorded. This was a silent dead capture.

`.claude/settings.json` is also **committed team config**: that is the point
of the project scope. A teammate who clones the repo without the CLI got a
`… hook error` notice from Claude Code on every prompt, every tool call and
every session start. In shell form, a command that can't start exits non-zero
(typically 127), which Claude Code shows as a non-blocking hook error.

Claude Code runs a command hook's string under `sh -c` on macOS and Linux,
under **Git Bash** on Windows, and under **PowerShell** on Windows when Git
Bash isn't installed (Claude Code hooks reference, "Command hook fields" →
`shell`). Any fix has to parse the same way in all three.

## Decision

**A. Report the truth.** Capture has three states, computed in one place
(`captureState()` / `wireCapture()` in provider-claude-code), and every
surface renders them:

| state | hooks | `chronicle` on PATH | shown as |
|---|---|---|---|
| `live` | installed | resolves | "capture is live" |
| `cli-missing` | installed | does **not** resolve | a warning plus the fix (`npm i -g gigai-chronicle`) |
| `off` | none | — | "not installed" |

The PATH lookup reproduces the shell's lookup without spawning a shell:
POSIX `PATH` plus the executable bit, and Windows `Path`/`PATH` plus
`PATHEXT` (npm's `chronicle.cmd` shim). Empty PATH entries are skipped,
because a `chronicle` that only resolves from the repo's cwd isn't an
installed CLI. `chronicle status` flags `cli-missing`. `chronicle doctor`
fails on it (exit 1). The extension warns on activation and after Start,
with **Copy install command** and **Learn more** buttons, and the sidebar
shows a banner instead of "capture is live".

**B. Make the committed hooks harmless without the CLI.** The hook command
becomes:

```
chronicle capture claude-code --event <Event>; exit 0
```

- `sh` / Git Bash: a missing `chronicle` prints "not found" to stderr, then
  `exit 0`. Claude Code doesn't surface stderr from an exit-0 hook.
- PowerShell 5.1 and 7: a missing command is a non-terminating error, then
  `exit 0`. `;` separates statements in every shell Claude Code uses.
- When the CLI *is* installed, nothing changes: `chronicle capture` already
  exits 0 by contract (CAPTURE-SURFACES §2.1), so `exit 0` masks nothing.

The hooks are still recognized by their unchanged
`chronicle capture claude-code --event` prefix. `installHooks()` upgrades
the old bare form **in place** (same entry, same position), so
`chronicle hooks install claude-code`, `chronicle init` and the extension's
Start migrate existing projects. Nothing is rewritten without one of those
explicit actions, since this file is committed team config.

## Alternatives considered

- **`npx --no-install chronicle capture …`** — rejected:
  - It doesn't fix the problem. When the package isn't installed, npx with
    `--no-install` exits **1** ("npx canceled due to missing packages"), so
    teammates still get a hook error on every prompt.
  - It needs Node and npm on PATH, which Claude Code's native installer
    doesn't provide.
  - It adds roughly 300 ms of npx startup to **every** hook, and
    `PostToolUse` fires on every tool call.
  - `chronicle` is not our package name (`gigai-chronicle` is). npx resolves
    the name `chronicle`, which is an avoidable supply-chain ambiguity.
- **A POSIX guard (`command -v chronicle >/dev/null 2>&1 || exit 0; …`)** —
  rejected. It is quieter on POSIX (no stderr line), but in PowerShell
  `command -v`, `/dev/null` and (in 5.1) `||` all fail. That would *break*
  Windows users without Git Bash who **do** have the CLI, which works today
  with the bare form.
- **Two entries per event, one with `"shell": "powershell"`** — rejected.
  Hooks can't be conditioned on platform, so macOS and Linux users without
  `pwsh` would get a hook error from the PowerShell entry.
- **A wrapper script committed into the repo (`.chronicle/bin/…`)** —
  rejected. A script still needs an interpreter per shell, adds a committed
  executable to every user repo, and has the same Windows split.
- **Ship the CLI inside the extension and point hooks at it** — rejected for
  now. Hooks would then contain a machine-specific absolute path inside
  committed team config, which breaks every teammate on another machine or
  OS. It's worth revisiting as a *user-scope* option.

## Consequences

- **The warning moves to where someone can act on it.** A teammate without
  the CLI now gets no capture and **no noise**. That silence is acceptable
  only because (A) makes it visible in `status`, `doctor`, the extension
  warning and the sidebar, where installing the CLI is one copied command
  away.
- On POSIX, a missing CLI still writes one "chronicle: not found" line to
  the hook's stderr. Claude Code drops exit-0 stderr (debug log only).
- "Live" is now a property of the machine that **reads** the state. The
  extension host's PATH can differ from the PATH of the terminal that
  launches Claude Code: macOS GUI apps, or a CLI installed while VS Code was
  open. The check is a strong signal, not a proof. The Learn-more page says
  so: restart the editor and the AI tool after installing.
- `captureState()`, `wireCapture()` and `chronicle init --json` gain
  `status` (and `cliPath`). `live` keeps its name and now means what it
  says. `status --json` and `doctor --json` gain the capture section, and
  doctor's `report.ok` includes it.
