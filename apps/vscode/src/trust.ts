/**
 * Workspace Trust guard — the manifest promises untrusted workspaces are
 * read-only (`capabilities.untrustedWorkspaces: limited`). Every command that
 * writes (store, prompts, hooks, checkpoints, memory) goes through this ONE
 * check, so the promise can't erode one command at a time.
 */
import * as vscode from "vscode";

export const MANAGE_TRUST = "Manage Workspace Trust";

/**
 * True when writing is allowed. Otherwise shows "trust this workspace
 * first" (with a shortcut to the trust editor) and returns false — the
 * caller must then do nothing.
 */
export function requireTrust(action: string): boolean {
  if (vscode.workspace.isTrusted) return true;
  void Promise.resolve(
    vscode.window.showWarningMessage(
      `Chronicle: ${action} writes to this repository — trust this workspace first.`,
      MANAGE_TRUST,
    ),
  ).then((choice) => {
    if (choice === MANAGE_TRUST) void vscode.commands.executeCommand("workbench.trust.manage");
  });
  return false;
}
