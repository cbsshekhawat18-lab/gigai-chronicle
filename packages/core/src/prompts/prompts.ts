/**
 * Prompt library — version control for prompts (ARCHITECTURE §5.4,
 * ADR-0011). Curated, versioned Markdown the user co-owns:
 *
 *   prompts/<slug>/prompt.md        current version (frontmatter + body)
 *   prompts/<slug>/versions/v<N>.md immutable snapshots
 *
 * Humans may edit prompt.md in any editor; `save` snapshots the next
 * version. Frontmatter is a minimal key/value subset parsed here — no YAML
 * dependency (core <10 runtime deps).
 */
import { mkdir, readFile, readdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { newId, isId } from "@gigaichronicle/schema";
import { ChronicleError } from "../errors.js";

export interface PromptMeta {
  id: string;
  slug: string;
  title: string;
  tags: string[];
  version: number;
  created: string;
  /** When THIS version was saved (per-version; distinct from `created`). */
  savedAt: string;
  sourceSession: string | null;
  /** Why this version exists — the "commit message" of the prompt library. */
  note: string | null;
}

export interface Prompt extends PromptMeta {
  body: string;
}

/** One node in a prompt's version history (git-graph rendering). */
export interface PromptVersionNode {
  version: number;
  savedAt: string;
  lines: number;
  /** The version's note when present, else the first non-empty body line —
   *  the "commit subject". */
  preview: string;
  /** The saved --note for this version (null on unannotated versions). */
  note: string | null;
  /** Lines added/removed vs the previous version (parent). */
  added: number;
  removed: number;
}

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/;

function promptsDir(chronicleDir: string): string {
  return path.join(chronicleDir, "prompts");
}

function promptFile(chronicleDir: string, slug: string): string {
  return path.join(promptsDir(chronicleDir), slug, "prompt.md");
}

function versionFile(chronicleDir: string, slug: string, version: number): string {
  return path.join(promptsDir(chronicleDir), slug, "versions", `v${version}.md`);
}

// ------------------------------------------------------------- frontmatter

function serialize(meta: PromptMeta, body: string): string {
  const lines = [
    "---",
    `id: ${meta.id}`,
    `slug: ${meta.slug}`,
    `title: ${meta.title}`,
    `tags: [${meta.tags.join(", ")}]`,
    `version: ${meta.version}`,
    `created: ${meta.created}`,
    `savedAt: ${meta.savedAt}`,
    ...(meta.sourceSession !== null ? [`sourceSession: ${meta.sourceSession}`] : []),
    // Frontmatter is line-based; a note is one line by construction (save strips newlines).
    ...(meta.note !== null && meta.note !== "" ? [`note: ${meta.note}`] : []),
    "---",
    "",
  ];
  return lines.join("\n") + body.replace(/\s+$/, "") + "\n";
}

/** Parse the minimal frontmatter subset; tolerant of hand edits. */
export function parsePrompt(content: string): Prompt | null {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(content);
  if (match === null) return null;
  const fields = new Map<string, string>();
  for (const line of (match[1] as string).split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    fields.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
  }
  const version = Number(fields.get("version") ?? "");
  const slug = fields.get("slug") ?? "";
  if (!SLUG_REGEX.test(slug) || !Number.isInteger(version) || version < 1) return null;
  const rawTags = fields.get("tags") ?? "[]";
  const tags = rawTags
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t !== "");
  const source = fields.get("sourceSession") ?? null;
  const note = fields.get("note") ?? null;
  return {
    id: fields.get("id") ?? "",
    slug,
    title: fields.get("title") ?? slug,
    tags,
    version,
    created: fields.get("created") ?? "",
    savedAt: fields.get("savedAt") ?? fields.get("created") ?? "",
    sourceSession: source !== null && isId(source, "session") ? source : null,
    note: note !== null && note !== "" ? note : null,
    // Canonical body: no trailing whitespace — serialize adds exactly one
    // final newline, so round-trips stay byte-stable across hand edits.
    body: content.slice(match[0].length).replace(/^\n/, "").replace(/\s+$/, ""),
  };
}

// ------------------------------------------------------------------- API

export interface SavePromptOptions {
  slug: string;
  /** Prompt text. When omitted on an existing slug, snapshots the current
   *  (possibly hand-edited) prompt.md body as the next version. */
  body?: string;
  title?: string;
  tags?: string[];
  sourceSession?: string;
  /** Why this version exists — one line, never inherited by later versions. */
  note?: string;
}

/** Create a prompt or add a new immutable version. Returns the saved state. */
export async function savePrompt(
  chronicleDir: string,
  options: SavePromptOptions,
): Promise<Prompt> {
  if (!SLUG_REGEX.test(options.slug)) {
    throw new ChronicleError(
      "E_INVALID_EVENT",
      `prompt slug must be kebab-case (a-z, 0-9, -): "${options.slug}"`,
    );
  }
  const existing = await getPrompt(chronicleDir, options.slug).catch(() => null);
  const body = (options.body ?? existing?.body)?.replace(/\s+$/, "");
  if (body === undefined || body.trim() === "") {
    throw new ChronicleError("E_INVALID_EVENT", "prompt body is empty — pass text or --from-file");
  }
  if (existing !== null && options.body !== undefined && body === existing.body) {
    return existing; // identical content — saving a no-op version would be noise
  }

  const now = new Date().toISOString().replace(/(\.\d{3})\d*Z$/, "$1Z");
  const meta: PromptMeta = {
    id: existing?.id ?? newId("prompt"),
    slug: options.slug,
    title: options.title ?? existing?.title ?? options.slug,
    tags: options.tags ?? existing?.tags ?? [],
    version: (existing?.version ?? 0) + 1,
    created: existing?.created ?? now,
    savedAt: now,
    sourceSession: options.sourceSession ?? existing?.sourceSession ?? null,
    // A note narrates ONE version — deliberately never inherited (a stale
    // "why" on a later version would be a lie).
    note: options.note?.replace(/\s+/g, " ").trim() || null,
  };

  const content = serialize(meta, body);
  const immutable = versionFile(chronicleDir, meta.slug, meta.version);
  if (await exists(immutable)) {
    throw new ChronicleError("E_LOCKED", `version file already exists: ${immutable}`);
  }
  await mkdir(path.dirname(immutable), { recursive: true });
  await writeFile(immutable, content, "utf8");
  await writeFile(promptFile(chronicleDir, meta.slug), content, "utf8");
  return { ...meta, body };
}

/**
 * Version-control rollback: make an old version's body the CURRENT version.
 * Append-only like everything else — v(N+1) is created carrying vTarget's
 * body; no version is ever rewritten or deleted, so the detour stays in the
 * history it came from.
 */
export async function revertPrompt(
  chronicleDir: string,
  slug: string,
  version: number,
  note?: string,
): Promise<Prompt> {
  const target = await getPrompt(chronicleDir, slug, version);
  const current = await getPrompt(chronicleDir, slug);
  if (target.body === current.body) {
    throw new ChronicleError(
      "E_INVALID_EVENT",
      `"${slug}" is already at v${version}'s content — nothing to revert`,
    );
  }
  return savePrompt(chronicleDir, {
    slug,
    body: target.body,
    note: note ?? `revert to v${version}`,
  });
}

export async function getPrompt(chronicleDir: string, slug: string, version?: number): Promise<Prompt> {
  const file =
    version === undefined ? promptFile(chronicleDir, slug) : versionFile(chronicleDir, slug, version);
  const content = await readFile(file, "utf8").catch(() => null);
  if (content === null) {
    throw new ChronicleError("E_NOT_INITIALIZED", `no prompt "${slug}"${version !== undefined ? ` v${version}` : ""}`);
  }
  const parsed = parsePrompt(content);
  if (parsed === null) {
    throw new ChronicleError("E_INVALID_EVENT", `unparseable prompt frontmatter: ${file}`);
  }
  return parsed;
}

export async function listPrompts(chronicleDir: string): Promise<Prompt[]> {
  const dir = promptsDir(chronicleDir);
  const slugs = await readdir(dir).catch(() => [] as string[]);
  const prompts: Prompt[] = [];
  for (const slug of slugs.sort()) {
    const prompt = await getPrompt(chronicleDir, slug).catch(() => null);
    if (prompt !== null) prompts.push(prompt);
  }
  return prompts;
}

/** Version numbers on disk, ascending. */
export async function promptVersions(chronicleDir: string, slug: string): Promise<number[]> {
  const dir = path.join(promptsDir(chronicleDir), slug, "versions");
  const files = await readdir(dir).catch(() => [] as string[]);
  return files
    .map((f) => /^v(\d+)\.md$/.exec(f)?.[1])
    .filter((v): v is string => v !== undefined)
    .map(Number)
    .sort((a, b) => a - b);
}

/** Count added/removed lines of `b` relative to `a` (git-diff-style multiset). */
function lineDelta(a: string, b: string): { added: number; removed: number } {
  const count = (text: string): Map<string, number> => {
    const map = new Map<string, number>();
    for (const line of text.split("\n")) map.set(line, (map.get(line) ?? 0) + 1);
    return map;
  };
  const ca = count(a);
  const cb = count(b);
  let added = 0;
  let removed = 0;
  for (const [line, n] of cb) added += Math.max(0, n - (ca.get(line) ?? 0));
  for (const [line, n] of ca) removed += Math.max(0, n - (cb.get(line) ?? 0));
  return { added, removed };
}

/**
 * Full version history for the git-graph view — one node per version,
 * newest first, each carrying its save time, size, subject line, and the
 * diff stats against its parent (the previous version).
 */
export async function promptHistory(
  chronicleDir: string,
  slug: string,
): Promise<PromptVersionNode[]> {
  const versions = await promptVersions(chronicleDir, slug);
  const nodes: PromptVersionNode[] = [];
  let prevBody = "";
  for (const version of versions) {
    const prompt = await getPrompt(chronicleDir, slug, version).catch(() => null);
    if (prompt === null) continue;
    const delta = lineDelta(prevBody, prompt.body);
    // The note is the version's own "commit subject" when the author wrote
    // one; the first body line is only the fallback.
    const preview =
      prompt.note ??
      prompt.body.split("\n").find((l) => l.trim() !== "")?.slice(0, 80) ??
      "(empty)";
    nodes.push({
      version,
      savedAt: prompt.savedAt,
      lines: prompt.body.split("\n").length,
      preview,
      note: prompt.note,
      added: delta.added,
      removed: delta.removed,
    });
    prevBody = prompt.body;
  }
  return nodes.reverse(); // newest first (git log order)
}

async function exists(file: string): Promise<boolean> {
  return stat(file).then(
    () => true,
    () => false,
  );
}
