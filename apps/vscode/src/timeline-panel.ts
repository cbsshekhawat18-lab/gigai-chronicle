/**
 * The ONE webview (§15.2): Timeline, rendering Replay Engine frames — never
 * raw provider data (design law 4). CSP-locked, theme via --vscode-* vars,
 * versioned snapshot/patch protocol; state stays host-side.
 */
import * as vscode from "vscode";
import type { SessionId } from "@gigaichronicle/schema";
import type { ChronicleWorkspace } from "./engine.js";
import type { HostMessage, WebviewMessage } from "./protocol.js";

export class TimelinePanel {
  static current: TimelinePanel | null = null;
  readonly #panel: vscode.WebviewPanel;
  #workspace: ChronicleWorkspace | null;

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

  /** Ask the webview to show one session (tree click path). */
  async showSession(session: SessionId): Promise<void> {
    if (this.#workspace === null) return;
    const frames = await this.#workspace.frames(session);
    await this.#post({ kind: "patch", v: 1, data: { session, frames } });
  }

  async #handle(message: WebviewMessage): Promise<void> {
    if (message.kind !== "query") return;
    try {
      if (this.#workspace === null) {
        await this.#post({ kind: "reply", v: 1, reqId: message.reqId, error: "not a chronicle project" });
        return;
      }
      if (message.name === "sessions") {
        await this.#post({ kind: "snapshot", v: 1, data: { sessions: await this.#workspace.sessions() } });
      } else {
        await this.showSession(message.args.session as SessionId);
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
  const script = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "dist", "webview.js"));
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
