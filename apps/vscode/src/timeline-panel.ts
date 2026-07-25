/**
 * The ONE webview (§15.2): Timeline, rendering the Replay Engine's stream
 * projection — never raw provider data (design law 4). CSP-locked, theme
 * via --vscode-* vars, versioned snapshot/patch protocol; state stays
 * host-side. Windows of WINDOW_SIZE entries lazy-load newest-first.
 */
import * as vscode from "vscode";
import path from "node:path";
import { listCheckpointedEvents, sessionGitActivity } from "@gigaichronicle/core";
import type { SessionId } from "@gigaichronicle/schema";
import type { ChronicleWorkspace } from "./engine.js";
import type { HostMessage, WebviewMessage } from "./protocol.js";
import { buildStream, mergeGitActivity, summarize, type StreamEntry, type StreamSummary } from "./stream.js";

/** Entries per window — a few screens of history per load. */
const WINDOW_SIZE = 300;

interface CachedStream {
  session: SessionId;
  entries: StreamEntry[];
  summary: StreamSummary;
}

export class TimelinePanel {
  static current: TimelinePanel | null = null;
  readonly #panel: vscode.WebviewPanel;
  #workspace: ChronicleWorkspace | null;
  #cache: CachedStream | null = null;

  private constructor(
    panel: vscode.WebviewPanel,
    workspace: ChronicleWorkspace | null,
    extensionUri: vscode.Uri,
  ) {
    this.#panel = panel;
    this.#workspace = workspace;
    panel.webview.html = renderHtml(panel.webview, extensionUri);
    panel.webview.onDidReceiveMessage((message: WebviewMessage) => {
      void this.#handle(message);
    });
    panel.onDidDispose(() => {
      if (TimelinePanel.current === this) TimelinePanel.current = null;
    });
  }

  static show(
    extensionUri: vscode.Uri,
    workspace: ChronicleWorkspace | null,
    column: vscode.ViewColumn = vscode.ViewColumn.One,
  ): TimelinePanel {
    if (TimelinePanel.current !== null) {
      TimelinePanel.current.#workspace = workspace;
      TimelinePanel.current.#panel.reveal(column);
      return TimelinePanel.current;
    }
    const panel = vscode.window.createWebviewPanel("chronicle.timeline", "Chronicle Timeline", column, {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, "dist")],
      retainContextWhenHidden: true,
    });
    TimelinePanel.current = new TimelinePanel(panel, workspace, extensionUri);
    return TimelinePanel.current;
  }

  /** Re-push the sessions + library snapshot (e.g. after a prompt is saved). */
  async refreshSnapshot(): Promise<void> {
    if (this.#workspace === null) return;
    const [sessions, prompts, settings] = await Promise.all([
      this.#workspace.sessions(),
      this.#workspace.libraryPrompts(),
      this.#workspace.settings(),
    ]);
    await this.#post({ kind: "snapshot", v: 1, data: { sessions, prompts, settings } });
  }

  /** Show a session: build (and cache) its stream, send the LATEST window. */
  async showSession(session: SessionId): Promise<void> {
    if (this.#workspace === null) return;
    const frames = await this.#workspace.frames(session);
    const repoRoot = path.dirname(this.#workspace.chronicleDir);
    const restorable = await listCheckpointedEvents(repoRoot).catch(() => new Set<string>());
    const summary = summarize(frames);
    // No provider emits git/file events, so the Commits/Files tabs would be
    // empty. Source them from the real history in this session's time window.
    const git = await sessionGitActivity(repoRoot, summary.startedTs, summary.endedTs).catch(() => ({
      commits: [],
      files: [],
    }));
    const entries = mergeGitActivity(buildStream(frames, restorable), git);
    summary.files = Math.max(summary.files, git.files.length);
    this.#cache = { session, entries, summary };
    await this.#sendWindow(session, Math.max(0, this.#cache.entries.length - WINDOW_SIZE), "replace");
  }

  async #sendWindow(
    session: SessionId,
    offset: number,
    mode: "replace" | "prepend",
  ): Promise<void> {
    if (this.#cache === null || this.#cache.session !== session) return;
    const info = (await this.#workspace?.sessions())?.find((s) => s.session === session);
    const entries = this.#cache.entries.slice(offset, offset + WINDOW_SIZE);
    await this.#post({
      kind: "patch",
      v: 1,
      data: {
        session,
        ...(info !== undefined ? { info } : {}),
        summary: this.#cache.summary,
        entries,
        offset,
        totalEntries: this.#cache.entries.length,
        mode,
      },
    });
  }

  async #handle(message: WebviewMessage): Promise<void> {
    if (message.kind === "restore") {
      await vscode.commands.executeCommand("chronicle.restoreCheckpoint", message.eventId);
      return;
    }
    if (message.kind === "compare") {
      await vscode.commands.executeCommand("chronicle.comparePrompts", message.a, message.b);
      return;
    }
    if (message.kind === "openPrompt") {
      await vscode.commands.executeCommand("chronicle.promptOpen", message.slug, message.version);
      return;
    }
    if (message.kind === "usePrompt") {
      await vscode.commands.executeCommand("chronicle.promptUse", message.slug, message.version);
      return;
    }
    if (message.kind === "savePrompt") {
      await vscode.commands.executeCommand("chronicle.savePrompt");
      return;
    }
    if (message.kind === "compareLibrary") {
      await vscode.commands.executeCommand(
        "chronicle.promptCompare",
        message.aSlug,
        message.aVersion,
        message.bSlug,
        message.bVersion,
      );
      return;
    }
    if (message.kind !== "query") return;
    try {
      if (this.#workspace === null) {
        await this.#post({ kind: "reply", v: 1, reqId: message.reqId, error: "not a chronicle project" });
        return;
      }
      if (message.name === "sessions") {
        const [sessions, prompts, settings] = await Promise.all([
          this.#workspace.sessions(),
          this.#workspace.libraryPrompts(),
          this.#workspace.settings(),
        ]);
        await this.#post({ kind: "snapshot", v: 1, data: { sessions, prompts, settings } });
      } else if (message.name === "frames") {
        await this.showSession(message.args.session as SessionId);
      } else {
        // "earlier": the window preceding `before`, from the cached stream.
        const start = Math.max(0, message.args.before - WINDOW_SIZE);
        await this.#sendWindow(message.args.session as SessionId, start, "prepend");
      }
      await this.#post({ kind: "reply", v: 1, reqId: message.reqId });
    } catch (error) {
      await this.#post({
        kind: "reply",
        v: 1,
        reqId: message.reqId,
        error: (error as Error).message,
      });
    }
  }

  async #post(message: HostMessage): Promise<void> {
    await this.#panel.webview.postMessage(message);
  }
}

function renderHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const script = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "dist", "timeline.js"));
  const nonce = Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join("");
  // CSP: default-src 'none' — scripts only from the extension, nothing remote (§15.3).
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';" />
  <title>Chronicle Timeline</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${script.toString()}"></script>
</body>
</html>`;
}
