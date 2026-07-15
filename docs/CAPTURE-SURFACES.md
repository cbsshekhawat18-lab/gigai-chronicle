# Gigai Chronicle — Capture Surface Audit

> Every legal and technical mechanism for observing AI-assisted development
> across VS Code, Cursor, Claude Code, Codex CLI, Gemini CLI, Git, and GitHub —
> classified by reliability. This audit is the factual basis for the provider
> roadmap in [ARCHITECTURE.md §4](ARCHITECTURE.md#4-the-hard-problem-capture)
> and the official capability matrix in [PROVIDERS.md](PROVIDERS.md).
>
> Status: `RESEARCHED 2026-07-14` (web-verified, see Sources) · Formats churn:
> re-verify quarterly and before each provider release.
> `⟲ v2 terminology:` capture integrations are called **providers** (v1 said
> "adapters"); they live in `packages/providers/*` and emit ChronicleEvents
> through the Event Engine only. Trailer is `Chronicle-Session:` (D7).

---

## 0. Classification Rubric & Legal Framework

**Classifications:**

| Class | Meaning |
|---|---|
| 🟢 **Reliable** | Documented, vendor-supported API/format; low breakage risk; can be a tier-1/2 provider foundation |
| 🟡 **Partial** | Works and is lawful, but incomplete data, opt-in configuration required, or undocumented-yet-stable format |
| 🟠 **Experimental** | Undocumented internals, breaks across vendor releases; ship off-by-default with format fingerprinting |
| 🔴 **Impossible** | No technical path, or **rejected by policy** (lawful-but-corrosive techniques we refuse; marked "by policy") |

**Legal framework** (engineering analysis, not legal advice — counsel review
required before launch):

1. **User-consented reading of local files on the user's own machine is the
   safe harbor.** Transcripts, logs, and databases that vendor tools write to
   the user's disk are data on hardware the user owns, accessed by software
   the user installed for that purpose. CFAA-style "unauthorized access"
   doctrines target *other people's* computers, not this.
2. **Format parsing for interoperability is long-settled practice.** Reading
   a JSONL or SQLite file format does not copy vendor code; data formats are
   parsed, not licensed. We never ship, decompile, or modify vendor binaries.
3. **The DMCA line: no circumvention.** We read what is stored in the plain —
   unencrypted JSONL, unencrypted SQLite. If a vendor ever encrypts or
   access-controls its local stores, that surface becomes 🔴 for us: we do
   not break protection measures, full stop.
4. **The ToS line: local artifacts vs. the service.** Vendor terms govern use
   of their *service* (API traffic, accounts). Reading residual local files
   does not interact with the service. By contrast, intercepting or modifying
   the tool's network traffic *does* — which is one reason it's rejected (§8).
5. **Privacy law rides on top.** Captured prompts may contain third parties'
   personal data; this is why redaction-at-capture, local-first defaults, and
   the consent gates in [PHASE-0.md §14](PHASE-0.md#14-privacy-model) exist.

---

## 1. Summary Matrix

| # | System | Mechanism | Class | Provider use |
|---|---|---|---|---|
| 1 | Claude Code | Hooks API (~30 lifecycle events) | 🟢 Reliable | **Tier 1 — flagship live capture** |
| 2 | Claude Code | Transcript JSONL (`~/.claude/projects/`) | 🟡 Partial | Tier 2 — backfill |
| 3 | Claude Code | OpenTelemetry export | 🟢 Reliable | Alternative/enterprise path |
| 4 | Claude Code | Agent SDK / `stream-json` output | 🟢 Reliable | Programmatic/CI capture |
| 5 | Codex CLI | Hooks (`hooks.json` / `[hooks]` in config.toml) | 🟢 Reliable | Tier 1 live capture |
| 6 | Codex CLI | Rollout JSONL (`~/.codex/sessions/`) | 🟢 Reliable* | Tier 2 — backfill (*location documented; format churns) |
| 7 | Codex CLI | `notify` program | 🟡 Partial | Fallback signal |
| 8 | Gemini CLI | OTel telemetry → local file/OTLP | 🟢 Reliable | Tier 1/2 live capture (opt-in config) |
| 9 | Gemini CLI | `~/.gemini/tmp/<hash>/` logs, checkpoints, saved chats | 🟡 Partial | Backfill, best-effort |
| 10 | Cursor (IDE chat) | `state.vscdb` SQLite (`cursorDiskKV`: `composerData`/`bubbleId`) | 🟠 Experimental | Off-by-default provider, Phase 2 |
| 11 | Cursor | Our extension runs in Cursor (VS Code fork, Open VSX) | 🟢 Reliable | UI + git/fs watching, not chat capture |
| 12 | Cursor | Public chat-capture API | 🔴 Impossible | None exists (their forum confirms) |
| 13 | VS Code | Extension API: FS watchers, `onDidChangeTextDocument`, SCM | 🟢 Reliable | Context events (`file.changed`, correlation) |
| 14 | VS Code | Git extension API (`vscode.git` exports) | 🟢 Reliable | Repo state, branch/commit signals |
| 15 | VS Code | Terminal shell integration API (command + output streams) | 🟡 Partial | Detect AI CLI invocations in integrated terminal; TUI output is noisy |
| 16 | VS Code | Copilot Chat content via public API | 🔴 Impossible | Extensions are sandboxed from each other's UI/state |
| 17 | VS Code | Copilot chat sessions in `workspaceStorage/chatSessions/*.json` | 🟠 Experimental | Possible future import-only provider |
| 18 | VS Code | Chat participant / `vscode.lm` APIs | 🟡 Partial | Only sees conversations explicitly routed to us — not observation |
| 19 | Git | Plumbing reads (`log`, `status --porcelain=v2`, `rev-parse`, reflog) | 🟢 Reliable | Core correlation input |
| 20 | Git | Watching `.git/HEAD`, refs, index mtime | 🟢 Reliable | Event triggers (GitLens-proven) |
| 21 | Git | Hooks (`post-commit`, `prepare-commit-msg`, `post-checkout`, `post-merge`, `pre-push`, `reference-transaction`, `post-rewrite`) | 🟢 Reliable | Opt-in trailer + commit events; must chain with husky/hook managers |
| 22 | Git | Commit trailers (`Chronicle-Session:`, interop with ai-trailers) | 🟢 Reliable | Exact correlation |
| 23 | Git | Git notes | 🟡 Partial | Rejected as storage; optional export target only |
| 24 | GitHub | REST/GraphQL APIs, `gh` CLI | 🟢 Reliable | PR/commit decoration (Phase 4) |
| 25 | GitHub | Webhooks + GitHub Apps | 🟢 Reliable | Cloud-phase event ingestion |
| 26 | GitHub | Actions (run `chronicle` in CI) | 🟢 Reliable | `deploy.recorded`, benchmark/test events |
| 27 | GitHub | Copilot Metrics API (org aggregate) | 🟡 Partial | Enterprise dashboards only; no content, admin-scoped |
| 28 | GitHub | Copilot chat content via API | 🔴 Impossible | Not exposed |
| 29 | Universal | pty wrapper (`chronicle wrap -- <tool>`) | 🟡 Partial | Tier 3 — works everywhere, lossy for TUIs |
| 30 | Universal | Shell hooks (zsh `preexec`, bash `PROMPT_COMMAND`) | 🟡 Partial | Invocation detection only, no content |
| 31 | Universal | Manual (`chronicle log`, extension command, MCP server) | 🟢 Reliable | Tier 4 — the floor; also deliberate agent-initiated logging |
| 32 | Universal | TLS/network interception proxy | 🔴 Impossible *(by policy)* | See §8 |
| 33 | Universal | Keylogging / accessibility-tree scraping / screen OCR | 🔴 Impossible *(by policy)* | See §8 |

---

## 2. Claude Code — the flagship surface

**2.1 Hooks API — 🟢 Reliable.** Officially documented
(code.claude.com/docs/en/hooks). Hooks are user-defined shell commands (also
HTTP endpoints) firing at lifecycle points, receiving JSON on stdin including
`session_id`, `transcript_path`, and `cwd`. The 2026 event surface is rich
(~30 events); the ones Chronicle consumes:

| Hook | Chronicle event(s) |
|---|---|
| `SessionStart` / `SessionEnd` | `session.started` / `session.ended` (with resume detection) |
| `UserPromptSubmit` | `prompt.submitted` |
| `Stop` | `prompt.responded` (turn complete; read details from transcript) |
| `PostToolUse` / `PostToolUseFailure` | `tool.invoked` (incl. Edit/Write → accepted-change signals) |
| `FileChanged` | `file.changed` attribution during agent activity |
| `SubagentStart` / `SubagentStop`, `TaskCreated` / `TaskCompleted` | sub-agent/task structure in the timeline |
| `PermissionRequest` / `PermissionDenied` | human-in-the-loop decision events |
| `PreCompact` / `PostCompact`, `ConfigChange`, `WorktreeCreate/Remove` | context-lifecycle and environment events |

Installation is clean: `chronicle init` merges hook entries into project
`.claude/settings.json` (committable — the whole team gets capture) or user
settings; hooks call `chronicle capture claude-code --event <name>` reading stdin.
**Limitations:** hooks are per-config-scope (user must accept the settings
change); a misbehaving hook can slow Claude Code — our hook must be
fire-and-forget (<5 ms append, no network, never block, exit 0 always).

**2.2 Transcript JSONL — 🟡 Partial.** `~/.claude/projects/<cwd-slug>/
<session-uuid>.jsonl`: full message/tool stream. Undocumented format —
version-fingerprint it, fail soft. Primary use: **backfill import** (the
five-minute aha) and enriching hook events with response bodies via the
`transcript_path` the hooks hand us (a documented pointer into the
undocumented file — the best of both).

**2.3 OpenTelemetry — 🟢 Reliable.** Documented managed telemetry
(`CLAUDE_CODE_ENABLE_TELEMETRY=1`, OTLP exporters; prompt content export is a
separate opt-in). Redundant with hooks for individuals; relevant for
enterprises that already run OTel collectors — and it validates mapping our
taxonomy to OTel GenAI semantic conventions (Phase-0 amendment A7).

**2.4 Agent SDK / headless `--output-format stream-json` — 🟢 Reliable.**
For CI and scripted runs, complete structured output without any file
spelunking. Powers `chronicle`-in-CI capture and our own test fixtures.

**Legal:** all four mechanisms are vendor-provided integration points or
user-owned local files. Cleanest surface of all seven systems.

---

## 3. Codex CLI — better than expected

**3.1 Hooks — 🟢 Reliable.** Now officially documented
(developers.openai.com/codex/hooks): lifecycle hooks load from `hooks.json`
or `[hooks]` tables in `config.toml` layers. Same integration pattern as
Claude Code: `chronicle init` writes hook entries invoking `chronicle capture codex`.

**3.2 Rollout files — 🟢 Reliable (location) / version-churning (format).**
Every session persists to `~/.codex/sessions/YYYY/MM/DD/
rollout-<session-id>.jsonl` — complete event stream: prompts, responses, tool
calls, approvals, token counts; archived sessions move to
`~/.codex/archived_sessions/`. Documented existence and structure; treat the
line-level schema as churning (fingerprint per Codex version). Backfill
gold.
**Limitation:** users can disable persistence by flag; capture then degrades
to hooks/notify.

**3.3 `notify` — 🟡 Partial.** External program invoked on events like
turn-completion with a JSON payload. Coarser than hooks; use as fallback
signal when hooks are unavailable in older Codex versions.

---

## 4. Gemini CLI

**4.1 OTel telemetry — 🟢 Reliable (opt-in).** Documented observability:
`telemetry` settings target `local` with an `outfile` (requires explicitly
empty OTLP endpoint) or OTLP gRPC/HTTP to a local collector. Logs/metrics
carry a common `sessionId` attribute; prompt content logging is a separate
opt-in (`logPrompts`). Chronicle's provider: configure file export into a Chronicle
spool dir and tail it — effectively vendor-supported structured capture.
**Limitation:** it's configuration the user must accept (`chronicle init` offers
it); telemetry semantics evolve with the CLI's release cadence.

**4.2 Local artifacts — 🟡 Partial.** `~/.gemini/tmp/<projectHash>/` holds
per-project logs, OTel collector output, and checkpointing data; `/chat save`
persists named conversations. Undocumented layouts — backfill/best-effort
only, fingerprinted.

---

## 5. Cursor (and the VS Code-fork family)

**5.1 Our extension inside Cursor — 🟢 Reliable.** Cursor runs VS Code
extensions (via Open VSX). Everything in §6 (file watching, git integration,
timeline UI, manual capture commands) works identically. What does *not*
exist there: any API into Cursor's AI chat.

**5.2 Chat store parsing — 🟠 Experimental.** Cursor persists chat in
`globalStorage/state.vscdb` (SQLite), table `cursorDiskKV`, keys
`composerData:<composerId>` (session metadata) and
`bubbleId:<composerId>:<bubbleId>` (messages). A community ecosystem of
export tools reads it — and community forums document it breaking across
updates (schema migrations, key renames). Verdict unchanged from Phase 0:
ship as `cursor-db` provider, **off by default, import-oriented, Phase 2**,
fingerprinted per Cursor version, read-only on a copied snapshot of the DB
(never open the live DB for write, avoid lock contention).
**Legal:** unencrypted SQLite on the user's disk, user-consented — lawful
(§0.1–0.3). If Cursor ever encrypts it, we stop (🔴 by our own rule).

**5.3 Public capture API — 🔴 Impossible.** Cursor exposes no chat API to
extensions (their forum confirms no way to enumerate chats). If/when Cursor
ships hooks or a chat-export API, the provider upgrades in place.

**Windsurf (same family):** extension runs 🟢; chat internals undocumented →
🟠 at best, not scheduled until demand proves out.

---

## 6. VS Code proper (+ GitHub Copilot)

**6.1 Extension API — 🟢 Reliable** for *context*, not chat: `workspace.
createFileSystemWatcher` + `onDidChangeTextDocument` (batched `file.changed`
events during active sessions; large multi-line insertions flagged as
AI-likely — *heuristic-grade, labeled as such per the honesty principle*),
window/editor focus events (session activity bounds), `extensions.getExtension
('vscode.git').exports` (repositories, branches, state-change subscriptions).

**6.2 Terminal shell integration — 🟡 Partial.** The stable API
(`window.onDidStartTerminalShellExecution` / `onDidEndTerminalShellExecution`
with a readable output stream) reveals command lines, exit codes, and output
of commands in the integrated terminal. For Chronicle: detect `claude` / `codex`
/ `gemini` invocations → open a session even when hooks aren't installed.
**Limitations:** requires shell integration to be active; full-screen TUIs
(all three AI CLIs) render escape-sequence noise, so *output* capture is
unreliable — use it for invocation/timing signals, not content.

**6.3 Copilot Chat — 🔴 Impossible via API, 🟠 via storage.** VS Code
extensions are isolated: no reading another extension's webview, state, or
chat. Chat participants and the `vscode.lm` API only see requests explicitly
addressed to us — an integration surface, not an observation one (🟡 for a
future deliberate `@chronicle` participant). Copilot chat sessions do persist as
JSON under `workspaceStorage/<hash>/chatSessions/` — undocumented, so an
import-only 🟠 provider is possible later; there is also a manual chat-export
command a user can invoke (🟡, tier 4).

---

## 7. Git & GitHub

**7.1 Git reads — 🟢 Reliable.** Plumbing over the system binary
(`git log --format`, `status --porcelain=v2 -z`, `rev-parse`, `diff
--name-only`, reflog for local movement history). Stable for decades;
GitLens-scale proven. Watching `.git/HEAD`, `refs/**`, index mtime: 🟢.

**7.2 Git hooks — 🟢 Reliable, with install etiquette.** `post-commit`
(commit events), `prepare-commit-msg` (opt-in `Chronicle-Session:` trailer),
`post-checkout`/`post-merge` (branch context), `pre-push` (push events),
`reference-transaction` (any ref update), `post-rewrite` (rebase/amend
honesty). **Limitations that shape design:** hooks are local-only (not
cloned) → `chronicle init` must offer per-machine install; one hook path per repo
→ must *chain*, never clobber (detect husky/lefthook/`core.hooksPath`,
append a guarded shim); hooks must be non-blocking (<10 ms, fail-open).

**7.3 Trailers — 🟢 Reliable.** `git interpret-trailers` native; renders on
GitHub/GitLab; greppable forever; interop with the ai-trailers convention
(read theirs, write ours).

**7.4 Git notes — 🟡 Partial.** Attach data to commits without touching
trees — but not fetched/pushed by default, invisible in most UIs,
conflict-prone. Confirmed as rejected-for-storage; optional export target
someday.

**7.5 GitHub — 🟢 Reliable** across REST/GraphQL (+ `gh` CLI) for PR/commit
decoration, webhooks + GitHub Apps for cloud-phase ingestion, and Actions for
CI-side events (`chronicle` runs in the workflow: `deploy.recorded`, benchmark
runs, regression status). Rate limits and app-permission scoping are
engineering constraints, not blockers. **Copilot Metrics API — 🟡**:
org-level aggregates (seat activity, suggestion counts), admin-scoped, no
content — usable for enterprise dashboards only. **Copilot chat content —
🔴**: not exposed by any API.

---

## 8. Rejected surfaces — 🔴 Impossible by policy

Technically feasible, categorically refused, and documented so future
contributors don't "helpfully" propose them:

1. **TLS interception / API proxying** (MITM cert injection, `HTTPS_PROXY`
   shims around vendor CLIs to read prompt/response traffic). Why refused:
   tampers with the *service* relationship (ToS exposure, unlike passive
   local files), requires trust-store modification (a security hole in the
   user's machine), breaks on cert pinning, and one CVE-shaped headline about
   "Chronicle intercepts your AI traffic" ends the product (Phase-0 risk R6).
2. **Keylogging, accessibility-tree scraping, screen OCR.** Observation
   without a data contract — indiscriminate (captures passwords, personal
   windows), legally radioactive in two-party-consent and workplace-privacy
   regimes, and the definition of the surveillance product we swore not to
   build ([PHASE-0.md §5.10](PHASE-0.md#5-product-boundaries)).
3. **Circumventing any encrypted or access-controlled vendor store.** DMCA
   §1201-shaped risk and a trust violation; the rule in §0.3 is absolute.

---

## 9. Design consequences (what this audit changes)

1. **Codex CLI is promotable.** Official hooks + documented rollout files
   mean Codex live capture is tier-1 grade, not tier-2 as assumed in
   ARCHITECTURE.md v1. Amendment: Phase 2's `providers/codex` upgrades from
   "log parsing" to "hooks + rollout backfill" — same pattern as Claude Code.
2. **Gemini CLI's honest path is OTel.** Build the Gemini provider as an OTel
   log consumer (file-export tail), not a log-scraper — and get the OTel
   GenAI semconv mapping (A7) almost for free.
3. **Hook installation is a product moment, not a config chore.** Three of
   our four tier-1 surfaces (Claude Code, Codex, git) are opt-in hook
   installs. `chronicle init`'s hook-merging UX (show the diff, never clobber,
   chain existing managers, one-command uninstall) is P0 engineering.
4. **The VS Code terminal API earns a place** as a zero-config session
   detector when hooks aren't installed yet — it turns "install friction"
   into "we noticed a Claude session; want full capture? one click."
5. **Copilot remains the observability hole** — by GitHub's choice, until
   they expose chat history. Manual capture + the possible chatSessions
   import are the only footholds; say so honestly in docs and marketing.

---

## Sources

- [Claude Code hooks reference (official)](https://code.claude.com/docs/en/hooks) · [hook event guides](https://claudefa.st/blog/tools/hooks/hooks-guide)
- [Codex CLI hooks (official)](https://developers.openai.com/codex/hooks) · [advanced config](https://developers.openai.com/codex/config-advanced) · [config reference](https://developers.openai.com/codex/config-reference) · [session archiving analysis](https://codex.danielvaughan.com/2026/06/02/codex-cli-session-archiving-lifecycle-management-v0136/)
- [Gemini CLI observability/OTel docs (official)](https://google-gemini.github.io/gemini-cli/docs/cli/telemetry.html) · [telemetry file-export issue #5063](https://github.com/google-gemini/gemini-cli/issues/5063)
- [Cursor local storage deep dive](https://vibe-replay.com/blog/cursor-local-storage/) · [Cursor forum: recovering chat history](https://forum.cursor.com/t/how-to-recover-chat-history-from-cursor-files/90272) · [Cursor chat bulk export (Open VSX)](https://open-vsx.org/extension/AnasAbbasCode/cursor-chat-bulk-export) · [forum: chat lost after SQL migration](https://forum.cursor.com/t/cursor-chat-lost-all-history-but-localf-complete-chat-composer-history-inaccessible-after-update-infinite-loading-sql-migration-failed/144289)
