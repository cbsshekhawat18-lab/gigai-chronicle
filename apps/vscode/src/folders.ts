/**
 * Multi-root folder resolution — pure, so it is testable without a window.
 * One ChronicleWorkspace per workspace folder; these decide which folder an
 * action means.
 */
import path from "node:path";

/** True when `file` is `folder` or inside it. */
function contains(folder: string, file: string): boolean {
  const rel = path.relative(folder, file);
  if (rel === "") return true;
  if (path.isAbsolute(rel)) return false; // another drive (Windows)
  return rel !== ".." && !rel.startsWith(`..${path.sep}`);
}

/** The workspace folder a file belongs to — the innermost when folders nest. */
export function folderContaining(folders: readonly string[], file: string): string | null {
  let best: string | null = null;
  for (const folder of folders) {
    if (contains(folder, file) && (best === null || folder.length > best.length)) best = folder;
  }
  return best;
}

/**
 * The folder the sidebar and folder-less commands act on: the active
 * editor's, else the one already current, else the first that records,
 * else the first.
 */
export function chooseCurrentFolder(input: {
  folders: readonly string[];
  recording: ReadonlySet<string>;
  activeFolder: string | null;
  previous: string | null;
}): string | null {
  const { folders, recording, activeFolder, previous } = input;
  if (activeFolder !== null && folders.includes(activeFolder)) return activeFolder;
  if (previous !== null && folders.includes(previous)) return previous;
  return folders.find((f) => recording.has(f)) ?? folders[0] ?? null;
}

/**
 * Folders "Start recording" can target, best guess first: the active
 * editor's folder leads when it isn't recording yet.
 */
export function startCandidates(
  folders: readonly string[],
  recording: ReadonlySet<string>,
  activeFolder: string | null,
): string[] {
  const open = folders.filter((f) => !recording.has(f));
  return activeFolder !== null && open.includes(activeFolder)
    ? [activeFolder, ...open.filter((f) => f !== activeFolder)]
    : open;
}
