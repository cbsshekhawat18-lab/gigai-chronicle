/**
 * gigaichronicle-vscode — activation per §15.1: Phase A synchronous
 * registration only; Phase B opens the store async; Phase C watchers;
 * Phase D idle work. Untrusted workspaces run read-only. One codebase for
 * VS Code, Cursor, Windsurf.
 */
import * as vscode from "vscode";
import type { SessionId } from "@gigaichronicle/schema";
import { ChronicleWorkspace } from "./engine.js";
import { SessionsTreeProvider } from "./sessions-tree.js";
import { TimelinePanel } from "./timeline-panel.js";
import type { SessionListItem } from "./protocol.js";

export function activate(context: vscode.ExtensionContext): void {
  // ---- Phase A (sync): register everything, render empty states ---------
  const tree = new SessionsTreeProvider();
  context.subscriptions.push(vscode.window.registerTreeDataProvider("chronicle.sessions", tree));

  let workspace: ChronicleWorkspace | null = null;

  context.subscriptions.push(
    vscode.commands.registerCommand("chronicle.openTimeline", () => {
      TimelinePanel.show(context.extensionUri, workspace);
    }),
    vscode.commands.registerCommand("chronicle.replaySession", async (item?: SessionListItem) => {
      if (item === undefined) return;
      const panel = TimelinePanel.show(context.extensionUri, workspace);
      await panel.showSession(item.session as SessionId);
    }),
    vscode.commands.registerCommand("chronicle.refresh", () => tree.refresh()),
  );

  // ---- Phase B (async): open the store ----------------------------------
  void (async () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (folder === undefined) return;
    // Untrusted workspaces: read-only surface — we still SHOW the journey
    // (reading committed files is what an editor does) but never capture.
    workspace = await ChronicleWorkspace.open(folder.uri.fsPath).catch(() => null);
    tree.setWorkspace(workspace);

    // ---- Phase C: watchers (debounced) — the extension owns fs watching (§15) ----
    if (workspace !== null) {
      const pattern = new vscode.RelativePattern(folder, ".chronicle/sessions/**/*.jsonl");
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      let timer: NodeJS.Timeout | undefined;
      const bump = (): void => {
        if (timer !== undefined) clearTimeout(timer);
        timer = setTimeout(() => tree.refresh(), 500);
      };
      watcher.onDidChange(bump);
      watcher.onDidCreate(bump);
      watcher.onDidDelete(bump);
      context.subscriptions.push(watcher);
    }
  })();
}

export function deactivate(): void {
  // Store handles are opened per-read and closed (engine.ts) — nothing to flush.
}
