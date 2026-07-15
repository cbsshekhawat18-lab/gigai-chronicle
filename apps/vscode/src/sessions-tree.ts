/** Native Sessions TreeView (§15.2) — the one MVP tree, lazy and honest. */
import * as vscode from "vscode";
import type { ChronicleWorkspace } from "./engine.js";
import type { SessionListItem } from "./protocol.js";

export class SessionsTreeProvider implements vscode.TreeDataProvider<SessionListItem> {
  readonly #onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.#onDidChange.event;
  #workspace: ChronicleWorkspace | null = null;

  setWorkspace(workspace: ChronicleWorkspace | null): void {
    this.#workspace = workspace;
    this.#onDidChange.fire();
  }

  refresh(): void {
    this.#onDidChange.fire();
  }

  async getChildren(element?: SessionListItem): Promise<SessionListItem[]> {
    if (element !== undefined || this.#workspace === null) return [];
    return this.#workspace.sessions();
  }

  getTreeItem(item: SessionListItem): vscode.TreeItem {
    const label = item.title ?? item.session;
    const tree = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    tree.id = item.session;
    tree.description = `${item.startedTs?.slice(0, 16).replace("T", " ") ?? "?"} · ${item.turns} turn(s)`;
    // Honesty in pixels (§15 DoD): degraded fidelity is visible, not hidden.
    tree.tooltip = [
      item.session,
      `fidelity: ${item.fidelity}${item.gaps > 0 ? ` · ⚠ ${item.gaps} capture gap(s)` : ""}`,
      `${item.turns} turn(s), ${item.tools} tool run(s)`,
    ].join("\n");
    tree.iconPath = new vscode.ThemeIcon(
      item.fidelity === "full" ? "comment-discussion" : item.fidelity === "partial" ? "warning" : "circle-outline",
    );
    tree.command = {
      command: "chronicle.replaySession",
      title: "Replay",
      arguments: [item],
    };
    return tree;
  }
}
