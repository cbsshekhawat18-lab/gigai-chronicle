/**
 * Live capture needs the `chronicle` CLI: the hooks Chronicle writes into
 * `.claude/settings.json` run `chronicle capture claude-code …`, and the
 * extension does not ship that binary. Hooks without the CLI record nothing
 * — and since ADR-0018 they stay quiet about it — so the extension is the
 * place that has to say so.
 */
import * as vscode from "vscode";

export type CaptureStatus = "live" | "cli-missing" | "off";

export const CLI_INSTALL_COMMAND = "npm i -g gigai-chronicle";
export const CLI_HELP_URL =
  "https://github.com/cbsshekhawat18-lab/gigai-chronicle/blob/main/docs/TROUBLESHOOTING.md#hooks-installed-but-nothing-is-recorded";

export const COPY_INSTALL = "Copy install command";
export const LEARN_MORE = "Learn more";

export const CLI_MISSING_MESSAGE =
  "Chronicle: capture hooks are installed, but the `chronicle` CLI isn't on your PATH — nothing is being recorded. " +
  `Install it (${CLI_INSTALL_COMMAND}), then restart your AI tool.`;

/** Where capture stands for a folder (hooks + CLI), without changing anything. */
export async function readCaptureStatus(root: string): Promise<CaptureStatus> {
  try {
    const { captureState } = await import("@gigaichronicle/provider-claude-code");
    return captureState(root).status;
  } catch {
    return "off";
  }
}

export async function copyInstallCommand(): Promise<void> {
  await vscode.env.clipboard.writeText(CLI_INSTALL_COMMAND);
  void vscode.window.showInformationMessage(
    `Chronicle: copied "${CLI_INSTALL_COMMAND}" — run it in a terminal, then Refresh.`,
  );
}

export async function openCliHelp(): Promise<void> {
  await vscode.env.openExternal(vscode.Uri.parse(CLI_HELP_URL));
}

/** The warning, with its two ways out. */
export async function warnCliMissing(): Promise<void> {
  const choice = await vscode.window.showWarningMessage(CLI_MISSING_MESSAGE, COPY_INSTALL, LEARN_MORE);
  if (choice === COPY_INSTALL) await copyInstallCommand();
  else if (choice === LEARN_MORE) await openCliHelp();
}
