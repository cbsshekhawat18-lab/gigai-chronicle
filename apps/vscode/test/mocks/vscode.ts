/** Minimal vscode API mock — just what the providers under test touch. */
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
