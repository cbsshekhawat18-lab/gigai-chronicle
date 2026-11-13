/**
 * The real `activate()` against real temp repositories, through the vscode
 * fake (test/mocks/vscode.ts):
 *  - workspace trust: every command that writes refuses in an untrusted
 *    workspace with "trust this workspace first" — and writes nothing;
 *  - multi-root: one store per folder, the sidebar follows the active
 *    editor, `chronicle.start` asks which folder;
 *  - CLI health: hooks without the `chronicle` CLI on PATH are reported as
 *    such (warning + sidebar), never as "capture is live".
 */
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { runInit } from "@gigaichronicle/core";
import { installHooks, settingsPathFor } from "@gigaichronicle/provider-claude-code";
import { activate } from "../src/extension.js";
import { CLI_HELP_URL, CLI_INSTALL_COMMAND, CLI_MISSING_MESSAGE, warnCliMissing } from "../src/cli-health.js";
import { chooseCurrentFolder, folderContaining, startCandidates } from "../src/folders.js";

// The fake's control surface (the alias maps "vscode" to test/mocks/vscode.ts).
const mock = (vscode as unknown as { __mock: typeof import("./mocks/vscode.js").__mock }).__mock;

const dirs: string[] = [];
const realEnv = { HOME: process.env["HOME"], USERPROFILE: process.env["USERPROFILE"], PATH: process.env["PATH"] };

beforeEach(() => {
  mock.reset();
  mock.config = { autoStart: "off" }; // tests opt in to auto-start explicitly
  // A home with no Claude Code and no user-scope hooks: detection is the test's.
  const home = temp("chronicle act home ");
  process.env["HOME"] = home;
  process.env["USERPROFILE"] = home;
  setCli(false);
});
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  process.env["HOME"] = realEnv.HOME;
  process.env["USERPROFILE"] = realEnv.USERPROFILE;
  process.env["PATH"] = realEnv.PATH;
});

function temp(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function gitRepo(name: string): string {
  const dir = path.join(temp("chronicle act "), name);
  mkdirSync(dir);
  execFileSync("git", ["-C", dir, "init", "-q", "-b", "main"]);
  execFileSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@t.invalid", "commit", "-q", "--allow-empty", "-m", "root"]);
  return dir;
}

async function recordingRepo(name: string, opts: { hooks?: boolean } = {}): Promise<string> {
  const dir = gitRepo(name);
  await runInit(dir, { detectedProviders: opts.hooks === true ? { "claude-code": "auto" } : {} });
  if (opts.hooks === true) installHooks(settingsPathFor(dir, "project"));
  return dir;
}

/** `chronicle` on PATH or not — git's own directory always stays reachable. */
function setCli(installed: boolean): void {
  const keep = (realEnv.PATH ?? "")
    .split(path.delimiter)
    .filter((dir) => !["chronicle", "chronicle.cmd", "chronicle.exe"].some((f) => existsSync(path.join(dir, f))));
  if (!installed) {
    process.env["PATH"] = keep.join(path.delimiter);
    return;
  }
  const bin = temp("chronicle act bin ");
  writeFileSync(path.join(bin, "chronicle"), "#!/bin/sh\nexit 0\n");
  chmodSync(path.join(bin, "chronicle"), 0o755);
  if (process.platform === "win32") writeFileSync(path.join(bin, "chronicle.cmd"), "@exit /b 0\r\n");
  process.env["PATH"] = [bin, ...keep].join(path.delimiter);
}

interface SidebarSnapshot {
  sessions: unknown[];
  project: boolean;
  capture: string | null;
  folder: string | null;
}

/** Activate, attach the sidebar webview, and collect what it is sent. */
function start(): { snapshots: SidebarSnapshot[]; send: (message: unknown) => void } {
  const memento = new Map<string, unknown>();
  activate({
    subscriptions: [],
    extensionUri: vscode.Uri.file(path.resolve("dist", "..")),
    workspaceState: {
      get: (key: string) => memento.get(key),
      update: (key: string, value: unknown) => {
        memento.set(key, value);
        return Promise.resolve();
      },
    },
  } as unknown as Parameters<typeof activate>[0]);
  const snapshots: SidebarSnapshot[] = [];
  let handler: (message: unknown) => void = () => undefined;
  mock.webviewProviders.get("chronicle.sessions")?.resolveWebviewView({
    webview: {
      options: {},
      html: "",
      asWebviewUri: (uri: unknown) => uri,
      postMessage: (message: { kind: string; data: SidebarSnapshot }) => {
        if (message.kind === "snapshot") snapshots.push(message.data);
        return Promise.resolve(true);
      },
      onDidReceiveMessage: (fn: (message: unknown) => void) => {
        handler = fn;
        return { dispose: () => undefined };
      },
    },
    onDidChangeVisibility: () => ({ dispose: () => undefined }),
    visible: true,
  });
  return { snapshots, send: (message) => handler(message) };
}

const last = <T>(list: T[]): T | undefined => list[list.length - 1];

/** vi.waitFor with room for a loaded CI box: activation does real git + fs work. */
const waitUntil = <T>(check: () => T): Promise<T> => vi.waitFor(check, { timeout: 15_000, interval: 25 });
const trustWarnings = (): string[] =>
  mock.messages.filter((m) => m.level === "warning" && m.text.includes("trust this workspace first")).map((m) => m.text);

describe("workspace trust — every writing command is guarded", () => {
  it("untrusted: each writing command says 'trust this workspace first' and writes nothing", async () => {
    const repo = await recordingRepo("trusted-not");
    const other = gitRepo("not-started");
    mock.setFolders([repo, other]);
    mock.isTrusted = false;
    const view = start();
    await waitUntil(() => expect(last(view.snapshots)?.project).toBe(true)); // the store opened (read-only)

    const prompts = path.join(repo, ".chronicle", "prompts");
    const before = existsSync(prompts) ? readdirSync(prompts) : [];
    mock.setActiveFile(path.join(repo, "notes.md"), "a prompt worth keeping");

    const writing: Array<[string, unknown[]]> = [
      ["chronicle.start", [other]],
      ["chronicle.start", []],
      ["chronicle.newPrompt", []],
      ["chronicle.savePrompt", []],
      ["chronicle.savePromptFromEditor", []],
      ["chronicle.restoreCheckpoint", ["evt_01ZZZZZZZZZZZZZZZZZZZZZZZZ", repo]],
      ["chronicle.createHandoff", []],
      ["chronicle.importCodex", []],
    ];
    for (const [command, args] of writing) {
      const shown = trustWarnings().length;
      await vscode.commands.executeCommand(command, ...args);
      expect(trustWarnings().length, `${command} must refuse`).toBe(shown + 1);
    }

    // Nothing was written: no store in the other folder, no prompt, no
    // handoff on the clipboard, no picker, no restore confirmation.
    expect(existsSync(path.join(other, ".chronicle"))).toBe(false);
    expect(existsSync(prompts) ? readdirSync(prompts) : []).toEqual(before);
    expect(existsSync(path.join(repo, ".chronicle", "memory"))).toBe(false);
    expect(mock.clipboard).toBe("");
    expect(mock.quickPicks).toHaveLength(0);
    expect(mock.messages.some((m) => m.text.startsWith("Restore "))).toBe(false);
    expect(trustWarnings()[0]).toMatch(/^Chronicle: .+ writes to this repository — trust this workspace first\.$/);

    // Read-only commands still work untrusted (the journey is still SHOWN).
    const shown = trustWarnings().length;
    await vscode.commands.executeCommand("chronicle.refresh");
    await vscode.commands.executeCommand("chronicle.prepareAiContext");
    expect(trustWarnings().length).toBe(shown);

    // Control: trusted, the same command really writes — the guard was the block.
    mock.isTrusted = true;
    await vscode.commands.executeCommand("chronicle.newPrompt");
    await waitUntil(() => expect(existsSync(path.join(prompts, "untitled"))).toBe(true));
  });
});

describe("multi-root — one store per folder", () => {
  it("the sidebar follows the active editor's folder, with the folder named", async () => {
    const a = await recordingRepo("alpha");
    const b = gitRepo("bravo");
    mock.setFolders([a, b]);
    const view = start();
    await waitUntil(() => expect(last(view.snapshots)).toMatchObject({ project: true, folder: "alpha" }));

    mock.setActiveFile(path.join(b, "src", "x.ts"));
    await waitUntil(() => expect(last(view.snapshots)).toMatchObject({ project: false, folder: "bravo" }));

    mock.setActiveFile(path.join(a, "README.md"));
    await waitUntil(() => expect(last(view.snapshots)).toMatchObject({ project: true, folder: "alpha" }));
  });

  it("chronicle.start asks WHICH folder (active editor's first) and starts the one picked", async () => {
    const a = await recordingRepo("alpha");
    const b = gitRepo("bravo");
    const c = gitRepo("charlie");
    mock.setFolders([a, b, c]);
    const view = start();
    await waitUntil(() => expect(last(view.snapshots)?.project).toBe(true));

    mock.setActiveFile(path.join(c, "main.go"));
    mock.pick = (items) => (items as Array<{ root: string }>).find((i) => i.root === b);
    await vscode.commands.executeCommand("chronicle.start");

    expect(mock.quickPicks).toHaveLength(1);
    const offered = mock.quickPicks[0]?.items as Array<{ root: string; description?: string }>;
    expect(offered.map((i) => i.root)).toEqual([c, b]); // never the recording one; active first
    expect(offered[0]?.description).toBe("active editor");
    expect(existsSync(path.join(b, ".chronicle", "config.json"))).toBe(true);
    expect(existsSync(path.join(c, ".chronicle"))).toBe(false);
  });

  it("the sidebar's Start button starts the folder it is showing — no question", async () => {
    const a = await recordingRepo("alpha");
    const b = gitRepo("bravo");
    mock.setFolders([a, b]);
    const view = start();
    mock.setActiveFile(path.join(b, "x.txt"));
    await waitUntil(() => expect(last(view.snapshots)).toMatchObject({ project: false, folder: "bravo" }));

    view.send({ kind: "command", command: "chronicle.start" });
    await waitUntil(() => expect(existsSync(path.join(b, ".chronicle", "config.json"))).toBe(true));
    expect(mock.quickPicks).toHaveLength(0);
    await waitUntil(() => expect(last(view.snapshots)).toMatchObject({ project: true, folder: "bravo" }));
  });

  it("single root, not recording: start just starts (no picker)", async () => {
    const repo = gitRepo("solo");
    mock.setFolders([repo]);
    start();
    await vscode.commands.executeCommand("chronicle.start");
    expect(mock.quickPicks).toHaveLength(0);
    expect(existsSync(path.join(repo, ".chronicle", "config.json"))).toBe(true);
    expect(mock.messages.some((m) => m.text.startsWith('Chronicle: now recording "solo"'))).toBe(true);
  });
});

describe("CLI health — hooks without the CLI are not 'capture is live'", () => {
  it("on activation in a started project: warns with the two buttons; the sidebar shows cli-missing", async () => {
    const repo = await recordingRepo("hooked", { hooks: true });
    mock.setFolders([repo]);
    const view = start();
    await waitUntil(() => expect(last(view.snapshots)).toMatchObject({ project: true, capture: "cli-missing" }));
    await waitUntil(() =>
      expect(mock.messages).toContainEqual({
        level: "warning",
        text: CLI_MISSING_MESSAGE,
        items: ["Copy install command", "Learn more"],
      }),
    );
    // The sidebar banner's buttons are wired to real commands.
    view.send({ kind: "command", command: "chronicle.copyCliInstallCommand" });
    await waitUntil(() => expect(mock.clipboard).toBe(CLI_INSTALL_COMMAND));
    view.send({ kind: "command", command: "chronicle.openCliHelp" });
    await waitUntil(() => expect(mock.opened).toEqual([CLI_HELP_URL]));
  });

  it("with the CLI on PATH: no warning, sidebar says live", async () => {
    setCli(true);
    const repo = await recordingRepo("hooked-ok", { hooks: true });
    mock.setFolders([repo]);
    const view = start();
    await waitUntil(() => expect(last(view.snapshots)).toMatchObject({ project: true, capture: "live" }));
    expect(mock.messages.some((m) => m.text === CLI_MISSING_MESSAGE)).toBe(false);
  });

  it("after start: hooks wired but no CLI → the warning, not 'now recording … capture is live'", async () => {
    const home = process.env["HOME"] as string;
    mkdirSync(path.join(home, ".claude")); // Claude Code "installed": start wires hooks
    const repo = gitRepo("fresh");
    mock.setFolders([repo]);
    start();
    await vscode.commands.executeCommand("chronicle.start");
    expect(existsSync(path.join(repo, ".claude", "settings.json"))).toBe(true);
    expect(mock.messages.some((m) => m.text === CLI_MISSING_MESSAGE)).toBe(true);
    expect(mock.messages.some((m) => m.text.includes("capture is live"))).toBe(false);
  });

  it("warning buttons: Copy install command → clipboard; Learn more → the help page", async () => {
    mock.respond = (m) => (m.text === CLI_MISSING_MESSAGE ? "Copy install command" : undefined);
    await warnCliMissing();
    expect(mock.clipboard).toBe("npm i -g gigai-chronicle");
    mock.respond = (m) => (m.text === CLI_MISSING_MESSAGE ? "Learn more" : undefined);
    await warnCliMissing();
    expect(mock.opened).toEqual([CLI_HELP_URL]);
  });
});

describe("folder resolution (pure)", () => {
  const A = path.resolve("/work/alpha");
  const AB = path.resolve("/work/alpha/packages/beta"); // nested folder
  const C = path.resolve("/work/charlie");

  it("a file belongs to its innermost folder; outside files belong to none", () => {
    expect(folderContaining([A, AB, C], path.join(AB, "src", "x.ts"))).toBe(AB);
    expect(folderContaining([A, AB, C], path.join(A, "README.md"))).toBe(A);
    expect(folderContaining([A, C], A)).toBe(A);
    expect(folderContaining([A, C], path.resolve("/work/alphabet/x"))).toBeNull(); // prefix ≠ inside
    expect(folderContaining([A, C], path.resolve("/elsewhere/x"))).toBeNull();
  });

  it("current folder: active editor's > previous > first recording > first", () => {
    const recording = new Set([C]);
    expect(chooseCurrentFolder({ folders: [A, C], recording, activeFolder: A, previous: C })).toBe(A);
    expect(chooseCurrentFolder({ folders: [A, C], recording, activeFolder: null, previous: A })).toBe(A);
    expect(chooseCurrentFolder({ folders: [A, C], recording, activeFolder: null, previous: null })).toBe(C);
    expect(chooseCurrentFolder({ folders: [A, C], recording: new Set(), activeFolder: null, previous: null })).toBe(A);
    expect(chooseCurrentFolder({ folders: [], recording, activeFolder: null, previous: null })).toBeNull();
  });

  it("start candidates exclude recording folders and lead with the active one", () => {
    expect(startCandidates([A, AB, C], new Set([A]), C)).toEqual([C, AB]);
    expect(startCandidates([A, AB, C], new Set([A]), A)).toEqual([AB, C]); // active is recording
    expect(startCandidates([A], new Set([A]), null)).toEqual([]);
  });
});
