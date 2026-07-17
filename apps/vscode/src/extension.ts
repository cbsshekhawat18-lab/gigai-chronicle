/**
 * gigaichronicle-vscode — activation per §15.1: Phase A synchronous
 * registration only; Phase B opens the store async; Phase C watchers;
 * Phase D idle work. Untrusted workspaces run read-only. One codebase for
 * VS Code, Cursor, Windsurf.
 */
import * as vscode from "vscode";
import { getPrompt, restoreCheckpoint, restorePreview } from "@gigaichronicle/core";
import path from "node:path";
import type { SessionId } from "@gigaichronicle/schema";
import { ChronicleWorkspace } from "./engine.js";
import { SessionsViewProvider } from "./sessions-view.js";
import { TimelinePanel } from "./timeline-panel.js";
import type { SessionListItem } from "./protocol.js";

export function activate(context: vscode.ExtensionContext): void {
  // ---- Phase A (sync): register everything, render empty states ---------
  const sidebar = new SessionsViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("chronicle.sessions", sidebar, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

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
    vscode.commands.registerCommand("chronicle.refresh", () => void sidebar.refresh()),
    vscode.commands.registerCommand("chronicle.restoreCheckpoint", async (eventId: string) => {
      if (workspace === null) return;
      const repoRoot = path.dirname(workspace.chronicleDir);
      const changing = await restorePreview(repoRoot, eventId).catch(() => []);
      if (changing.length === 0) {
        void vscode.window.showInformationMessage("Chronicle: code already matches that moment.");
        return;
      }
      const pick = await vscode.window.showWarningMessage(
        `Restore ${changing.length} file(s) to how they were at this prompt? A safety checkpoint of the current state is taken first — nothing is lost.`,
        { modal: true, detail: changing.slice(0, 12).join("\n") + (changing.length > 12 ? `\n… and ${changing.length - 12} more` : "") },
        "Restore",
      );
      if (pick !== "Restore") return;
      try {
        const result = await restoreCheckpoint(repoRoot, eventId);
        void vscode.window.showInformationMessage(
          `Chronicle: restored ${result.restored.length} file(s).` +
            (result.untouchedNewFiles.length > 0
              ? ` ${result.untouchedNewFiles.length} newer file(s) left in place.`
              : ""),
        );
      } catch (error) {
        void vscode.window.showErrorMessage(`Chronicle restore failed: ${(error as Error).message}`);
      }
    }),
    // Prompt versions in the NATIVE diff editor — the git-style version UI
    // (§15.2: virtual documents via TextDocumentContentProvider, no Monaco).
    vscode.workspace.registerTextDocumentContentProvider("chronicle-prompt", {
      provideTextDocumentContent: async (uri: vscode.Uri): Promise<string> => {
        if (workspace === null) return "(not a chronicle project)";
        const [, slug, versionPart] = uri.path.split("/");
        if (slug === undefined || versionPart === undefined) return "(bad prompt uri)";
        if (versionPart === "empty.md") return "";
        const vp = versionPart.replace(/\.md$/, "");
        const version = vp === "current" ? undefined : Number(vp);
        const prompt = await getPrompt(workspace.chronicleDir, slug, version).catch(() => null);
        return prompt === null ? "(version not found)" : prompt.body + "\n";
      },
    }),
    vscode.commands.registerCommand(
      "chronicle.promptDiff",
      async (slug: string, version: number) => {
        // Git-log behavior: a version diffs against its PARENT (what changed
        // IN this version). v1 has no parent — show it against the empty tree.
        const left =
          version <= 1
            ? vscode.Uri.parse(`chronicle-prompt:/${slug}/empty.md`)
            : vscode.Uri.parse(`chronicle-prompt:/${slug}/${version - 1}.md`);
        const right = vscode.Uri.parse(`chronicle-prompt:/${slug}/${version}.md`);
        await vscode.commands.executeCommand(
          "vscode.diff",
          left,
          right,
          version <= 1 ? `${slug}: v1 (initial)` : `${slug}: v${version - 1} → v${version}`,
        );
      },
    ),
    vscode.commands.registerCommand("chronicle.promptOpen", async (slug: string, version: number) => {
      const doc = await vscode.workspace.openTextDocument(
        vscode.Uri.parse(`chronicle-prompt:/${slug}/${version}.md`),
      );
      await vscode.window.showTextDocument(doc, { preview: true });
    }),
  );

  // ---- Phase B (async): open the store ----------------------------------
  void (async () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (folder === undefined) return;
    // Untrusted workspaces: read-only surface — we still SHOW the journey
    // (reading committed files is what an editor does) but never capture.
    workspace = await ChronicleWorkspace.open(folder.uri.fsPath).catch(() => null);
    sidebar.setWorkspace(workspace);

    // ---- Phase C: watchers (debounced) — the extension owns fs watching (§15) ----
    if (workspace !== null) {
      const pattern = new vscode.RelativePattern(folder, ".chronicle/sessions/**/*.jsonl");
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      let timer: NodeJS.Timeout | undefined;
      const bump = (): void => {
        if (timer !== undefined) clearTimeout(timer);
        timer = setTimeout(() => void sidebar.refresh(), 500);
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
