/**
 * gigaichronicle-vscode — activation per §15.1: Phase A synchronous
 * registration only; Phase B opens the store async; Phase C watchers;
 * Phase D idle work. Untrusted workspaces run read-only. One codebase for
 * VS Code, Cursor, Windsurf.
 */
import * as vscode from "vscode";
import {
  getPrompt,
  listPrompts,
  restoreCheckpoint,
  restorePreview,
  savePrompt,
  suggestSlug,
} from "@gigaichronicle/core";
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
    // "Save prompt" (ADR-0014) — the seam between the two prompt worlds.
    // Chronicle already captured every prompt you typed; the library holds
    // the curated ones. Without this the only way to library a prompt you
    // wrote is to RETYPE it — the exact manual hoarding P1 describes. Pick a
    // captured prompt, pick where it goes, done.
    vscode.commands.registerCommand("chronicle.savePrompt", async () => {
      if (workspace === null) {
        void vscode.window.showInformationMessage("Chronicle: not a chronicle project.");
        return;
      }
      const dir = workspace.chronicleDir;
      const recent = await workspace.recentPrompts().catch(() => []);
      if (recent.length === 0) {
        void vscode.window.showInformationMessage(
          "Chronicle: no captured prompts yet. Type a prompt in your AI tool and it appears here — nothing to copy by hand.",
        );
        return;
      }

      type PromptPick = vscode.QuickPickItem & { index: number };
      const picked = await vscode.window.showQuickPick<PromptPick>(
        recent.map((p, index) => ({
          label: p.text.replace(/\s+/g, " ").trim().slice(0, 74),
          detail: `${p.ts.replace("T", " ").slice(0, 16)}  ·  ${p.text.split("\n").length} line(s)`,
          index,
        })),
        { title: "Save a prompt to the library", placeHolder: "Which prompt do you want to keep?" },
      );
      if (picked === undefined) return;
      const source = recent[picked.index];
      if (source === undefined) return;

      // Where it lands. Choosing an existing prompt adds a VERSION — this is
      // the step that makes the versioning model visible instead of implied.
      const existing = await listPrompts(dir).catch(() => []);
      const NEW = "$(add) New prompt…";
      const target = await vscode.window.showQuickPick(
        [
          { label: NEW, detail: "Start a new prompt at v1" },
          ...existing.map((p) => ({
            label: p.slug,
            description: `v${p.version} → v${p.version + 1}`,
            detail: p.title,
          })),
        ],
        { title: "Save as", placeHolder: "New prompt, or a new version of an existing one" },
      );
      if (target === undefined) return;

      let slug = target.label;
      let title: string | undefined;
      if (target.label === NEW) {
        const entered = await vscode.window.showInputBox({
          title: "New prompt — slug",
          value: suggestSlug(source.text),
          prompt: "kebab-case id, e.g. auth-review",
          validateInput: (value) =>
            /^[a-z0-9][a-z0-9-]{0,63}$/.test(value) ? null : "lowercase letters, digits and dashes only",
        });
        if (entered === undefined) return;
        slug = entered;
        title = await vscode.window.showInputBox({
          title: "New prompt — title",
          value: source.text.replace(/\s+/g, " ").trim().slice(0, 60),
          prompt: "Human name for this prompt",
        });
        if (title === undefined) return;
      }

      try {
        const saved = await savePrompt(dir, {
          slug,
          body: source.text,
          ...(title !== undefined ? { title } : {}),
          ...(source.session !== null ? { sourceSession: source.session } : {}),
        });
        await sidebar.refresh();
        const open = await vscode.window.showInformationMessage(
          `Chronicle: saved ${saved.slug} v${saved.version} — the prompt you typed, not retyped. Commit .chronicle/prompts/ and your team gets it.`,
          "Open",
        );
        if (open === "Open") {
          await vscode.commands.executeCommand("chronicle.promptOpen", saved.slug, saved.version);
        }
      } catch (error) {
        void vscode.window.showErrorMessage(`Chronicle: save failed — ${(error as Error).message}`);
      }
    }),
    // "Why is this file like this?" (ADR-0013) — git blame says WHO, this says
    // what was ASKED. A native QuickPick lists the prompts that shaped the
    // file; each row can open the session replay or restore that moment.
    vscode.commands.registerCommand("chronicle.whyFile", async (target?: vscode.Uri) => {
      if (workspace === null) {
        void vscode.window.showInformationMessage("Chronicle: not a chronicle project.");
        return;
      }
      const uri = target ?? vscode.window.activeTextEditor?.document.uri;
      if (uri === undefined || uri.scheme !== "file") {
        void vscode.window.showInformationMessage("Chronicle: open a file to ask why it looks like this.");
        return;
      }
      const repoRoot = path.dirname(workspace.chronicleDir);
      const relative = path.relative(repoRoot, uri.fsPath);
      if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
        void vscode.window.showInformationMessage("Chronicle: that file is outside this repository.");
        return;
      }
      const posix = relative.split(path.sep).join("/");

      const entries = await workspace
        .why(posix)
        .catch((error: unknown) => {
          void vscode.window.showErrorMessage(`Chronicle why failed: ${(error as Error).message}`);
          return [];
        });
      if (entries.length === 0) {
        void vscode.window.showInformationMessage(
          `Chronicle: no captured prompt is known to have changed ${posix}. ` +
            "why reads the checkpoints capture takes at each prompt — it can only answer for work done since capture was running.",
        );
        return;
      }

      const restoreButton: vscode.QuickInputButton = {
        iconPath: new vscode.ThemeIcon("history"),
        tooltip: "Restore your code to this moment",
      };
      type WhyPick = vscode.QuickPickItem & { session: string | null; eventId: string };
      const items: WhyPick[] = entries.map((e) => {
        const when = e.ts === null ? "unknown time" : e.ts.replace("T", " ").slice(0, 16);
        const churn = e.binary ? "binary" : `+${e.insertions} −${e.deletions}`;
        const text = e.prompt === null ? "(prompt text not captured — metadata-only mode)" : e.prompt.replace(/\s+/g, " ").trim();
        return {
          label: text.length > 74 ? `${text.slice(0, 73)}…` : text,
          description: churn,
          detail: `${when}  ·  ${e.eventId}`,
          buttons: [restoreButton],
          session: e.session,
          eventId: e.eventId,
        };
      });

      const qp = vscode.window.createQuickPick<WhyPick>();
      qp.title = `Why ${posix} looks like this — ${entries.length} prompt(s)`;
      qp.placeholder = "Enter: replay that session · ⟳ button: restore your code to that moment";
      qp.items = items;
      qp.matchOnDescription = true;
      qp.matchOnDetail = true;
      qp.onDidTriggerItemButton(async ({ item }) => {
        qp.hide();
        await vscode.commands.executeCommand("chronicle.restoreCheckpoint", item.eventId);
      });
      qp.onDidAccept(async () => {
        const item = qp.selectedItems[0];
        qp.hide();
        if (item?.session != null && workspace !== null) {
          const panel = TimelinePanel.show(context.extensionUri, workspace);
          await panel.showSession(item.session as SessionId);
        }
      });
      qp.onDidHide(() => qp.dispose());
      qp.show();
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
