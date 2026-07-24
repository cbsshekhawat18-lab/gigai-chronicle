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

/**
 * The scaffold inserted into the blank "New prompt" editor. Stripped on save
 * by EXACT prefix match only — a prompt whose real body legitimately begins
 * with an HTML comment (e.g. `<!-- role: system -->`) must survive untouched.
 */
const NEW_PROMPT_SCAFFOLD =
  "<!-- New Chronicle prompt. Write it below, then run:\n" +
  '     Command Palette → "Chronicle: Save editor as prompt"\n' +
  "     (or the ＋ Save prompt button → “Save the file I’m editing”). This comment is dropped on save. -->\n\n";

/** Drop a UTF-8 BOM and the new-prompt scaffold (only if present, verbatim). */
function stripScaffold(text: string): string {
  const noBom = text.replace(/^﻿/, "");
  return noBom.startsWith(NEW_PROMPT_SCAFFOLD) ? noBom.slice(NEW_PROMPT_SCAFFOLD.length) : noBom;
}

export function activate(context: vscode.ExtensionContext): void {
  // ---- Phase A (sync): register everything, render empty states ---------
  const sidebar = new SessionsViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("chronicle.sessions", sidebar, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  let workspace: ChronicleWorkspace | null = null;

  // ---- prompt authoring (save NEW prompts, not only promote typed ones) ----

  /** Save `body` as a prompt — fully automatic. The id is derived from the
   *  first line of the content (the name is too, at read time), so nothing is
   *  asked. The one place all content-bearing "save a prompt" paths converge. */
  async function saveNewOrVersion(body: string, session: string | null): Promise<void> {
    if (workspace === null) return;
    const dir = workspace.chronicleDir;
    const firstLine = body.split("\n").find((l) => l.trim() !== "") ?? "";
    const taken = new Set((await listPrompts(dir).catch(() => [])).map((p) => p.slug));
    let slug = suggestSlug(firstLine) || "prompt";
    if (taken.has(slug)) {
      let n = 2;
      while (taken.has(`${slug}-${n}`)) n += 1;
      slug = `${slug}-${n}`;
    }
    try {
      const saved = await savePrompt(dir, {
        slug,
        body,
        ...(session !== null ? { sourceSession: session } : {}),
      });
      await sidebar.refresh();
      await TimelinePanel.current?.refreshSnapshot();
      const open = await vscode.window.showInformationMessage(
        `Chronicle: saved ${saved.slug} v${saved.version}. It lives in .chronicle/prompts/ — commit it and your team gets it.`,
        "Open",
      );
      if (open === "Open") await vscode.commands.executeCommand("chronicle.promptOpen", saved.slug, saved.version);
    } catch (error) {
      void vscode.window.showErrorMessage(`Chronicle: save failed — ${(error as Error).message}`);
    }
  }

  /**
   * Write a fresh prompt for later. The prompt is CREATED immediately (so it
   * appears in the library at once — no silent "did it save?" trap), then its
   * editable file opens so the body can be written/refined, multi-line and all.
   * Edits to that file are the current prompt; a later save snapshots a version.
   */
  async function authorNewPrompt(): Promise<void> {
    if (workspace === null) {
      void vscode.window.showInformationMessage("Chronicle: not a chronicle project.");
      return;
    }
    const dir = workspace.chronicleDir;
    // ZERO questions — full automation. Create an "untitled" prompt at once and
    // open its file; the NAME is derived from the first line you write (the
    // library re-reads the file live), so you never have to name anything.
    const taken = new Set((await listPrompts(dir).catch(() => [])).map((p) => p.slug));
    let slug = "untitled";
    if (taken.has(slug)) {
      let n = 2;
      while (taken.has(`untitled-${n}`)) n += 1;
      slug = `untitled-${n}`;
    }
    const STARTER = "Untitled — replace this with your prompt, then save (⌘S).";
    try {
      const saved = await savePrompt(dir, { slug, body: STARTER, note: "draft — saved for later" });
      await sidebar.refresh();
      await TimelinePanel.current?.refreshSnapshot();
      const file = vscode.Uri.file(path.join(dir, "prompts", saved.slug, "prompt.md"));
      const doc = await vscode.workspace.openTextDocument(file);
      const editor = await vscode.window.showTextDocument(doc);
      const idx = doc.getText().indexOf(STARTER);
      if (idx >= 0) {
        const range = new vscode.Range(doc.positionAt(idx), doc.positionAt(idx + STARTER.length));
        editor.selection = new vscode.Selection(range.start, range.end);
        editor.revealRange(range);
      }
      void vscode.window.showInformationMessage(
        "Chronicle: new prompt saved — just write it below. The first line becomes its name automatically.",
      );
    } catch (error) {
      void vscode.window.showErrorMessage(`Chronicle: save failed — ${(error as Error).message}`);
    }
  }

  /** Turn the active editor (or its selection) into a library prompt. */
  async function savePromptFromEditor(): Promise<void> {
    if (workspace === null) {
      void vscode.window.showInformationMessage("Chronicle: not a chronicle project.");
      return;
    }
    const editor = vscode.window.activeTextEditor;
    if (editor === undefined) {
      void vscode.window.showInformationMessage("Chronicle: open or write a prompt in an editor first.");
      return;
    }
    const sel = editor.selection;
    const raw = sel.isEmpty ? editor.document.getText() : editor.document.getText(sel);
    const body = stripScaffold(raw).trim();
    if (body === "") {
      void vscode.window.showInformationMessage("Chronicle: nothing to save — the editor (or selection) is empty.");
      return;
    }
    await saveNewOrVersion(body, null);
  }

  /** Backfill this repo's Codex sessions (import-only; Codex is untouched). */
  async function importCodex(): Promise<void> {
    if (workspace === null) {
      void vscode.window.showInformationMessage("Chronicle: not a chronicle project.");
      return;
    }
    if (!vscode.workspace.isTrusted) {
      void vscode.window.showWarningMessage("Chronicle: importing writes to the store — trust this workspace first.");
      return;
    }
    // Only the current repo path — the SAFE under-approximation. Codex records
    // each rollout's cwd, so a session run before a repo move keeps its old
    // cwd and is skipped here (the CLI's WorkspaceMoved scan would catch it).
    // Under-importing is correct; it can never leak another project's session.
    const repoRoot = path.dirname(workspace.chronicleDir);
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "Chronicle: importing Codex sessions…" },
      async () => {
        try {
          const { runBackfill } = await import("@gigaichronicle/provider-codex");
          const report = await runBackfill(workspace!.chronicleDir, { knownWorkspacePaths: [repoRoot] });
          await sidebar.refresh();
          await TimelinePanel.current?.refreshSnapshot();
          void vscode.window.showInformationMessage(
            report.eventsImported > 0
              ? `Chronicle: imported ${report.eventsImported} event(s) from ${report.filesImported} Codex session(s). Open the Timeline to replay them.`
              : `Chronicle: no new Codex sessions for this repo${
                  report.filesForeign > 0 ? ` (${report.filesForeign} from other projects skipped)` : ""
                }.`,
          );
        } catch (error) {
          void vscode.window.showErrorMessage(`Chronicle: Codex import failed — ${(error as Error).message}`);
        }
      },
    );
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("chronicle.newPrompt", () => authorNewPrompt()),
    vscode.commands.registerCommand("chronicle.savePromptFromEditor", () => savePromptFromEditor()),
    vscode.commands.registerCommand("chronicle.importCodex", () => importCodex()),
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
    // Captured prompts as virtual documents, addressed by event id — the seam
    // behind "Compare" in the dashboard. Same TextDocumentContentProvider
    // pattern as prompt versions (§15.2), so two prompts you TYPED open in the
    // native diff editor with no Monaco and no data leaving the store.
    vscode.workspace.registerTextDocumentContentProvider("chronicle-capture", {
      provideTextDocumentContent: async (uri: vscode.Uri): Promise<string> => {
        if (workspace === null) return "(not a chronicle project)";
        const eventId = uri.path.replace(/^\//, "").replace(/\.md$/, "");
        const text = await workspace.promptText(eventId).catch(() => null);
        return text === null
          ? `(no captured prompt text for ${eventId} — unknown event, or metadata-only capture)`
          : `${text}\n`;
      },
    }),
    vscode.commands.registerCommand("chronicle.comparePrompts", async (a: string, b: string) => {
      // Older prompt on the left so the diff reads "how the newer one changed".
      const [left, right] = a < b ? [a, b] : [b, a];
      await vscode.commands.executeCommand(
        "vscode.diff",
        vscode.Uri.parse(`chronicle-capture:/${left}.md`),
        vscode.Uri.parse(`chronicle-capture:/${right}.md`),
        `prompt ${left.slice(0, 12)}… → ${right.slice(0, 12)}…`,
      );
    }),
    // "Use" a library prompt: body onto the clipboard, ready to paste into
    // your AI tool. Deliberately NOT a usage counter — usage is derived when
    // capture sees the text actually submitted (core promptUsage), so the
    // number in the UI is an observation, never a click.
    vscode.commands.registerCommand("chronicle.promptUse", async (slug: string, version?: number) => {
      if (workspace === null) return;
      const prompt = await getPrompt(workspace.chronicleDir, slug, version).catch(() => null);
      if (prompt === null) {
        void vscode.window.showErrorMessage(`Chronicle: no prompt "${slug}"${version !== undefined ? ` v${version}` : ""}.`);
        return;
      }
      await vscode.env.clipboard.writeText(prompt.body);
      void vscode.window.showInformationMessage(
        `Chronicle: ${slug} v${prompt.version} copied — paste it into your AI tool. When capture sees it submitted, it counts as used.`,
      );
    }),
    // Cross-prompt compare in the native diff editor — two library prompts
    // (research variants, or yours vs a teammate's), any versions. Reuses
    // the chronicle-prompt: provider registered above.
    vscode.commands.registerCommand(
      "chronicle.promptCompare",
      async (aSlug: string, aVersion: number, bSlug: string, bVersion: number) => {
        await vscode.commands.executeCommand(
          "vscode.diff",
          vscode.Uri.parse(`chronicle-prompt:/${aSlug}/${aVersion}.md`),
          vscode.Uri.parse(`chronicle-prompt:/${bSlug}/${bVersion}.md`),
          `${aSlug}@v${aVersion} ⇄ ${bSlug}@v${bVersion}`,
        );
      },
    ),
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
      const recent = await workspace.recentPrompts().catch(() => []);

      // Three ways in — authoring a NEW prompt for later is first, so the
      // library is never limited to prompts you already typed.
      type Action = { kind: "new" } | { kind: "editor" } | { kind: "promote"; index: number };
      const items: Array<vscode.QuickPickItem & { action?: Action }> = [
        {
          label: "$(edit) Write a new prompt for later…",
          detail: "Author a fresh prompt — research, drafts, anything. No need to have typed it in an AI tool.",
          action: { kind: "new" },
        },
      ];
      const rawEditor = vscode.window.activeTextEditor?.document.getText();
      const editorText = rawEditor === undefined ? undefined : stripScaffold(rawEditor).trim();
      if (editorText !== undefined && editorText !== "") {
        items.push({
          label: "$(save) Save the file I’m editing",
          detail: "Turn the active editor (or selection) into a library prompt",
          action: { kind: "editor" },
        });
      }
      if (recent.length > 0) {
        items.push({ label: "Promote a prompt you typed", kind: vscode.QuickPickItemKind.Separator });
        recent.forEach((p, index) =>
          items.push({
            label: p.text.replace(/\s+/g, " ").trim().slice(0, 74),
            detail: `${p.ts.replace("T", " ").slice(0, 16)}  ·  ${p.text.split("\n").length} line(s)`,
            action: { kind: "promote", index },
          }),
        );
      }

      const picked = await vscode.window.showQuickPick(items, {
        title: "Save a prompt to the library",
        placeHolder: "Write a new one, save what you’re editing, or promote a prompt you typed",
      });
      if (picked?.action === undefined) return;
      if (picked.action.kind === "new") return authorNewPrompt();
      if (picked.action.kind === "editor") return savePromptFromEditor();
      const source = recent[picked.action.index];
      if (source === undefined) return;
      await saveNewOrVersion(source.text, source.session);
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
        // Metadata-only capture yields the [METADATA-ONLY] marker, which is
        // honest on its face; null means a >64KB body in a blob sidecar —
        // a different thing, and not a privacy mode (ADR-0015).
        const text =
          e.prompt === null
            ? "(prompt body over 64KB — stored separately)"
            : e.prompt.replace(/\s+/g, " ").trim();
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
      let timer: NodeJS.Timeout | undefined;
      const bump = (): void => {
        if (timer !== undefined) clearTimeout(timer);
        timer = setTimeout(() => {
          void sidebar.refresh();
          void TimelinePanel.current?.refreshSnapshot();
        }, 500);
      };
      // Sessions (capture) AND the prompt library — so hand-editing a
      // prompt.md is reflected live in the sidebar and dashboard.
      for (const glob of [".chronicle/sessions/**/*.jsonl", ".chronicle/prompts/**"]) {
        const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, glob));
        watcher.onDidChange(bump);
        watcher.onDidCreate(bump);
        watcher.onDidDelete(bump);
        context.subscriptions.push(watcher);
      }
    }
  })();
}

export function deactivate(): void {
  // Store handles are opened per-read and closed (engine.ts) — nothing to flush.
}
