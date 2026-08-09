/**
 * Project Memory persistence — curated Markdown under `.chronicle/`.
 *
 * Shared memory lives in `.chronicle/memory/<kind>/<id>.md` (git-tracked,
 * diffable, travels by clone). Local (private-derived) memory lives in
 * `.chronicle/.local/memory/<kind>/<id>.md`, which the store's .gitignore
 * already excludes — the hard privacy line: memory derived from a `local`
 * event can never enter the shared, pushable store.
 *
 * Files are the canonical persisted form, but memory is fully DERIVED: a
 * rebuild deletes and regenerates them from the event history. Deterministic
 * ids keep that rebuild byte-identical (no churn) when nothing changed.
 */
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  MEMORY_KINDS,
  parseMemory,
  serializeMemory,
  validateMemoryItem,
  type MemoryItem,
  type MemoryKind,
  type MemoryVisibility,
} from "./schema.js";

/** Root dir for a visibility tier. Shared is committed; local is git-ignored. */
function memoryRoot(chronicleDir: string, visibility: MemoryVisibility): string {
  return visibility === "local"
    ? path.join(chronicleDir, ".local", "memory")
    : path.join(chronicleDir, "memory");
}

function itemFile(chronicleDir: string, item: Pick<MemoryItem, "id" | "kind" | "visibility">): string {
  return path.join(memoryRoot(chronicleDir, item.visibility), item.kind, `${item.id}.md`);
}

/** Persist one memory item (validates first; a `local` item never hits the shared dir). */
export async function writeMemory(chronicleDir: string, item: MemoryItem): Promise<void> {
  const errors = validateMemoryItem(item);
  if (errors.length > 0) {
    throw new Error(`invalid memory item ${item.id}: ${errors.join("; ")}`);
  }
  const file = itemFile(chronicleDir, item);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, serializeMemory(item), "utf8");
}

/** Read one memory item by id + kind, searching shared then (optionally) local. */
export async function readMemory(
  chronicleDir: string,
  kind: MemoryKind,
  id: string,
  options: { includeLocal?: boolean } = {},
): Promise<MemoryItem | null> {
  const tiers: MemoryVisibility[] = options.includeLocal === true ? ["shared", "local"] : ["shared"];
  for (const visibility of tiers) {
    const file = path.join(memoryRoot(chronicleDir, visibility), kind, `${id}.md`);
    const content = await readFile(file, "utf8").catch(() => null);
    if (content !== null) {
      const parsed = parseMemory(content);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

export interface ListMemoryOptions {
  /** Only this kind. */
  kind?: MemoryKind;
  /** Include local (private-derived) memory — an owner-only read. Default false. */
  includeLocal?: boolean;
}

/**
 * All memory items, deterministically ordered (kind, then id) so callers and
 * snapshots are stable. Shared only unless `includeLocal` is set.
 */
export async function listMemory(
  chronicleDir: string,
  options: ListMemoryOptions = {},
): Promise<MemoryItem[]> {
  const tiers: MemoryVisibility[] = options.includeLocal === true ? ["shared", "local"] : ["shared"];
  const kinds = options.kind !== undefined ? [options.kind] : MEMORY_KINDS;
  const items: MemoryItem[] = [];
  for (const visibility of tiers) {
    for (const kind of kinds) {
      const dir = path.join(memoryRoot(chronicleDir, visibility), kind);
      const files = await readdir(dir).catch(() => [] as string[]);
      for (const file of files.sort()) {
        if (!file.endsWith(".md")) continue;
        const content = await readFile(path.join(dir, file), "utf8").catch(() => null);
        if (content === null) continue;
        const parsed = parseMemory(content);
        if (parsed !== null) items.push(parsed);
      }
    }
  }
  return items.sort((a, b) => (a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind.localeCompare(b.kind)));
}

/**
 * Remove all DERIVED memory so it can be regenerated. Deletes the shared
 * `memory/` tree and (when asked) the local one; leaves the event history — the
 * source of truth — untouched. This is what `chronicle memory rebuild` calls
 * before re-deriving.
 */
export async function clearMemory(
  chronicleDir: string,
  options: { includeLocal?: boolean } = {},
): Promise<void> {
  await rm(memoryRoot(chronicleDir, "shared"), { recursive: true, force: true });
  if (options.includeLocal === true) {
    await rm(memoryRoot(chronicleDir, "local"), { recursive: true, force: true });
  }
}
