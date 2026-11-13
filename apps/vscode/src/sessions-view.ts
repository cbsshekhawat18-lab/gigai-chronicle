/**
 * Sessions sidebar as a WEBVIEW VIEW (founder decision: card UI like the
 * polished Codex/GitLens sidebars — native trees can't render cards). Still
 * the ONE session list; the timeline panel stays pure replay. Same CSP and
 * pure-projection rules as the panel (§15.3).
 *
 * The sidebar shows ONE folder at a time (multi-root: the active editor's).
 * Every command it triggers carries that folder's root, so a click acts on
 * the repository it was shown for — never on whatever got focus since.
 */
import * as vscode from "vscode";
import type { ChronicleWorkspace } from "./engine.js";
import type { SessionListItem } from "./protocol.js";
import { readCaptureStatus } from "./cli-health.js";

type SidebarMessage =
  | { kind: "ready" }
  | { kind: "open"; item: SessionListItem }
  | { kind: "promptDiff"; slug: string; version: number }
  | { kind: "promptUse"; slug: string; version: number }
  /** Quick-action toolbar buttons → run the matching command. */
  | {
      kind: "command";
      command:
        | "chronicle.openTimeline"
        | "chronicle.savePrompt"
        | "chronicle.whyFile"
        | "chronicle.refresh"
        | "chronicle.start"
        | "chronicle.copyCliInstallCommand"
        | "chronicle.openCliHelp";
    };

/** Allow-list: the webview can never ask to run an arbitrary command. */
const ALLOWED_COMMANDS = new Set([
  "chronicle.openTimeline",
  "chronicle.savePrompt",
  "chronicle.whyFile",
  "chronicle.refresh",
  "chronicle.start",
  "chronicle.copyCliInstallCommand",
  "chronicle.openCliHelp",
]);

/** Commands that act on a folder: they receive the sidebar's root. */
const SCOPED_COMMANDS = new Set(["chronicle.openTimeline", "chronicle.savePrompt", "chronicle.start"]);

export interface SidebarScope {
  workspace: ChronicleWorkspace | null;
  /** The workspace folder shown (null: no folder open). */
  root: string | null;
  /** Folder name, shown only when the window has several folders. */
  folderLabel: string | null;
}

export class SessionsViewProvider implements vscode.WebviewViewProvider {
  #view: vscode.WebviewView | null = null;
  #scope: SidebarScope = { workspace: null, root: null, folderLabel: null };

  constructor(private readonly extensionUri: vscode.Uri) {}

  get root(): string | null {
    return this.#scope.root;
  }

  setScope(scope: SidebarScope): void {
    this.#scope = scope;
    void this.refresh();
  }

  async refresh(): Promise<void> {
    if (this.#view === null) return;
    const { workspace, root, folderLabel } = this.#scope;
    const sessions = workspace === null ? [] : await workspace.sessions();
    // One code path with the dashboard (engine.libraryPrompts) — the sidebar
    // shows the same derived lifecycle status, never a second opinion.
    const prompts = workspace === null ? [] : await workspace.libraryPrompts().catch(() => []);
    // Hooks are wiring, not proof: without the CLI on PATH they record
    // nothing, and the sidebar must say so rather than imply capture is on.
    const capture = workspace === null || root === null ? null : await readCaptureStatus(root);
    // `project` separates "no store here" from "empty store": the same blank
    // list used to mean both, so a project that was never started read as one
    // with nothing in it and the fix was never obvious.
    await this.#view.webview.postMessage({
      kind: "snapshot",
      v: 1,
      data: { sessions, prompts, project: workspace !== null, capture, folder: folderLabel },
    });
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.#view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "dist")],
    };
    const script = view.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "sessions.js"),
    );
    const nonce = Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join("");
    view.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';" />
  <title>Chronicle Sessions</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${script.toString()}"></script>
</body>
</html>`;
    view.webview.onDidReceiveMessage((message: SidebarMessage) => {
      const root = this.#scope.root ?? undefined;
      if (message.kind === "ready") void this.refresh();
      else if (message.kind === "open") {
        void vscode.commands.executeCommand("chronicle.replaySession", message.item, root);
      } else if (message.kind === "promptDiff") {
        void vscode.commands.executeCommand("chronicle.promptDiff", message.slug, message.version, root);
      } else if (message.kind === "promptUse") {
        void vscode.commands.executeCommand("chronicle.promptUse", message.slug, message.version, root);
      } else if (message.kind === "command" && ALLOWED_COMMANDS.has(message.command)) {
        if (SCOPED_COMMANDS.has(message.command)) void vscode.commands.executeCommand(message.command, root);
        else void vscode.commands.executeCommand(message.command);
      }
    });
    view.onDidChangeVisibility(() => {
      if (view.visible) void this.refresh();
    });
  }
}
