/**
 * vscode API fake — enough of the surface for the providers under test AND
 * for running the real `activate()` against real temp repositories. State a
 * test controls (trust, folders, the active editor, how dialogs are
 * answered) and state it inspects (messages shown, clipboard, opened URLs,
 * registered commands) lives on `__mock`; `__mock.reset()` between tests.
 */
import path from "node:path";

export class EventEmitter<T> {
  #listeners: Array<(e: T) => void> = [];
  event = (listener: (e: T) => void): { dispose(): void } => {
    this.#listeners.push(listener);
    return { dispose: () => void 0 };
  };
  fire(data: T): void {
    for (const l of this.#listeners) l(data);
  }
}

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export class TreeItem {
  id?: string;
  description?: string;
  tooltip?: string;
  iconPath?: unknown;
  command?: unknown;
  constructor(
    public label: string,
    public collapsibleState: TreeItemCollapsibleState,
  ) {}
}

export class ThemeIcon {
  constructor(public id: string) {}
}

export class Uri {
  private constructor(
    readonly scheme: string,
    readonly path: string,
    readonly query: string,
  ) {}
  get fsPath(): string {
    return this.path;
  }
  static file(fsPath: string): Uri {
    return new Uri("file", fsPath, "");
  }
  static parse(value: string): Uri {
    const match = /^([a-z][\w+.-]*):(.*)$/i.exec(value);
    return match === null ? new Uri("file", value, "") : new Uri(match[1] as string, match[2] as string, "");
  }
  static from(parts: { scheme: string; path?: string; query?: string }): Uri {
    return new Uri(parts.scheme, parts.path ?? "", parts.query ?? "");
  }
  static joinPath(base: Uri, ...segments: string[]): Uri {
    return new Uri(base.scheme, path.join(base.path, ...segments), "");
  }
  toString(): string {
    return `${this.scheme}:${this.path}${this.query === "" ? "" : `?${this.query}`}`;
  }
}

export class RelativePattern {
  constructor(
    public base: unknown,
    public pattern: string,
  ) {}
}
export class Range {
  constructor(
    public start: unknown,
    public end: unknown,
  ) {}
}
export class Selection extends Range {}
export enum ProgressLocation {
  Notification = 15,
}
export enum ViewColumn {
  One = 1,
}
export enum QuickPickItemKind {
  Separator = -1,
  Default = 0,
}

type Level = "info" | "warning" | "error";
export interface ShownMessage {
  level: Level;
  text: string;
  items: string[];
}
interface FakeEditor {
  document: { uri: Uri; getText(range?: unknown): string };
  selection: { isEmpty: boolean };
}

const activeEditorChanged = new EventEmitter<FakeEditor | undefined>();
const foldersChanged = new EventEmitter<{ added: unknown[]; removed: unknown[] }>();

export const __mock = {
  isTrusted: true,
  workspaceFolders: [] as Array<{ uri: Uri; name: string; index: number }>,
  activeTextEditor: undefined as FakeEditor | undefined,
  config: {} as Record<string, unknown>,
  commands: new Map<string, (...args: unknown[]) => unknown>(),
  webviewProviders: new Map<string, { resolveWebviewView(view: unknown): void }>(),
  messages: [] as ShownMessage[],
  quickPicks: [] as Array<{ items: unknown[]; options: unknown }>,
  clipboard: "",
  opened: [] as string[],
  /** How a shown message is answered (default: dismissed). */
  respond: (_message: ShownMessage): string | undefined => undefined,
  /** How a QuickPick is answered (default: dismissed). */
  pick: (_items: unknown[]): unknown => undefined,

  setFolders(roots: string[]): void {
    this.workspaceFolders = roots.map((root, index) => ({ uri: Uri.file(root), name: path.basename(root), index }));
  },
  setActiveFile(file: string | null, text = ""): void {
    this.activeTextEditor =
      file === null
        ? undefined
        : { document: { uri: Uri.file(file), getText: () => text }, selection: { isEmpty: true } };
    activeEditorChanged.fire(this.activeTextEditor);
  },
  reset(): void {
    this.isTrusted = true;
    this.workspaceFolders = [];
    this.activeTextEditor = undefined;
    this.config = {};
    this.commands = new Map();
    this.webviewProviders = new Map();
    this.messages = [];
    this.quickPicks = [];
    this.clipboard = "";
    this.opened = [];
    this.respond = () => undefined;
    this.pick = () => undefined;
  },
};

function show(level: Level, text: string, rest: unknown[]): Promise<string | undefined> {
  const message: ShownMessage = { level, text, items: rest.filter((r): r is string => typeof r === "string") };
  __mock.messages.push(message);
  return Promise.resolve(__mock.respond(message));
}

const disposable = { dispose: (): void => undefined };

export const window = {
  get activeTextEditor(): FakeEditor | undefined {
    return __mock.activeTextEditor;
  },
  onDidChangeActiveTextEditor: activeEditorChanged.event,
  registerWebviewViewProvider(id: string, provider: { resolveWebviewView(view: unknown): void }) {
    __mock.webviewProviders.set(id, provider);
    return disposable;
  },
  showInformationMessage: (text: string, ...rest: unknown[]) => show("info", text, rest),
  showWarningMessage: (text: string, ...rest: unknown[]) => show("warning", text, rest),
  showErrorMessage: (text: string, ...rest: unknown[]) => show("error", text, rest),
  showQuickPick: (items: unknown[], options?: unknown) => {
    __mock.quickPicks.push({ items, options });
    return Promise.resolve(__mock.pick(items));
  },
  showInputBox: () => Promise.resolve(undefined),
  showTextDocument: () => Promise.resolve({ selection: undefined, revealRange: () => undefined }),
  withProgress: (_options: unknown, task: () => Promise<unknown>) => task(),
};

export const workspace = {
  get isTrusted(): boolean {
    return __mock.isTrusted;
  },
  get workspaceFolders() {
    return __mock.workspaceFolders.length === 0 ? undefined : __mock.workspaceFolders;
  },
  onDidChangeWorkspaceFolders: foldersChanged.event,
  getConfiguration: () => ({
    get: <T>(key: string, fallback: T): T => (key in __mock.config ? (__mock.config[key] as T) : fallback),
  }),
  registerTextDocumentContentProvider: () => disposable,
  createFileSystemWatcher: () => ({
    onDidChange: () => disposable,
    onDidCreate: () => disposable,
    onDidDelete: () => disposable,
    dispose: () => undefined,
  }),
  openTextDocument: () => Promise.resolve({ getText: () => "", positionAt: () => 0 }),
};

export const commands = {
  registerCommand(id: string, fn: (...args: unknown[]) => unknown) {
    __mock.commands.set(id, fn);
    return disposable;
  },
  executeCommand(id: string, ...args: unknown[]): Promise<unknown> {
    const fn = __mock.commands.get(id);
    return Promise.resolve(fn === undefined ? undefined : fn(...args));
  },
};

export const env = {
  clipboard: {
    writeText(text: string): Promise<void> {
      __mock.clipboard = text;
      return Promise.resolve();
    },
  },
  openExternal(uri: Uri): Promise<boolean> {
    __mock.opened.push(uri.toString());
    return Promise.resolve(true);
  },
};
