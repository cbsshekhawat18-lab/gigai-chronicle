/**
 * Sessions sidebar as a WEBVIEW VIEW (founder decision: card UI like the
 * polished Codex/GitLens sidebars — native trees can't render cards). Still
 * the ONE session list; the timeline panel stays pure replay. Same CSP and
 * pure-projection rules as the panel (§15.3).
 */
import * as vscode from "vscode";
import { listPrompts } from "@gigaichronicle/core";
import type { ChronicleWorkspace } from "./engine.js";
import type { SessionListItem } from "./protocol.js";

type SidebarMessage =
  | { kind: "ready" }
  | { kind: "open"; item: SessionListItem }
  | { kind: "promptDiff"; slug: string; version: number };

export class SessionsViewProvider implements vscode.WebviewViewProvider {
  #view: vscode.WebviewView | null = null;
  #workspace: ChronicleWorkspace | null = null;

  constructor(private readonly extensionUri: vscode.Uri) {}

  setWorkspace(workspace: ChronicleWorkspace | null): void {
    this.#workspace = workspace;
    void this.refresh();
  }

  async refresh(): Promise<void> {
    if (this.#view === null) return;
    const sessions = this.#workspace === null ? [] : await this.#workspace.sessions();
    const prompts =
      this.#workspace === null ? [] : await listPrompts(this.#workspace.chronicleDir).catch(() => []);
    await this.#view.webview.postMessage({ kind: "snapshot", v: 1, data: { sessions, prompts } });
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
      if (message.kind === "ready") void this.refresh();
      else if (message.kind === "open") {
        void vscode.commands.executeCommand("chronicle.replaySession", message.item);
      } else if (message.kind === "promptDiff") {
        void vscode.commands.executeCommand("chronicle.promptDiff", message.slug, message.version);
      }
    });
    view.onDidChangeVisibility(() => {
      if (view.visible) void this.refresh();
    });
  }
}
