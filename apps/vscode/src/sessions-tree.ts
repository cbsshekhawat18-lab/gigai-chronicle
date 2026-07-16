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
    const tree = new vscode.TreeItem(item.label, vscode.TreeItemCollapsibleState.None);
    tree.id = item.session;
    tree.description = `${relativeTime(item.startedTs)} · ${item.turns} turns${item.models.length > 0 ? ` · ${item.models[item.models.length - 1]}` : ""}`;
    // Honesty in pixels (§15 DoD): degraded fidelity is visible, not hidden.
    tree.tooltip = [
      item.label,
      "",
      `started: ${item.startedTs?.replace("T", " ").slice(0, 19) ?? "?"} UTC`,
      `AI: ${[...item.providers, ...item.models].join(", ") || "unknown"}`,
      `fidelity: ${item.fidelity}${item.gaps > 0 ? ` · ⚠ ${item.gaps} capture gap(s)` : ""}`,
      `${item.turns} turn(s), ${item.tools} tool run(s)`,
      `id: ${item.session}`,
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

/** "2h ago" beats a timestamp for scanning a list (git-log habit). */
function relativeTime(ts: string | null): string {
  if (ts === null) return "?";
  const ms = Date.now() - Date.parse(ts);
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d ago` : ts.slice(0, 10);
}
