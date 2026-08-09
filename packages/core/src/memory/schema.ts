/**
 * Project Memory — the schema (docs/project-memory.md).
 *
 * Project Memory is DERIVED knowledge about the software project: what it knows,
 * why decisions were made, what is currently true, what failed before, and what
 * remains unfinished — the understanding distilled from Chronicle's immutable
 * event history. It is NOT a second source of truth: every item carries
 * provenance back to the events it came from, and the whole store rebuilds from
 * those events (see `chronicle memory rebuild`).
 *
 * A MemoryItem's `id` is DERIVED deterministically from its kind + content, so a
 * rebuild is idempotent — the same history always yields byte-identical files
 * (no git churn), and two extractions of the same fact collapse to one item.
 * This is the property the golden rebuild test relies on.
 *
 * Line-based frontmatter, no YAML dependency (core stays <10 runtime deps),
 * mirroring the prompt library's curated-Markdown convention.
 */
import { createHash } from "node:crypto";

/** What a memory item is about (docs/project-memory.md §2). */
export type MemoryKind =
  | "project"
  | "architecture"
  | "decision"
  | "constraint"
  | "requirement"
  | "current_work"
  | "todo"
  | "known_issue"
  | "completed_work"
  | "failed_approach"
  | "important_file"
  | "integration"
  | "dependency"
  | "test_gap"
  | "handoff";

/** Lifecycle state — history is immutable, so nothing is deleted, only superseded. */
export type MemoryStatus =
  | "candidate"
  | "active"
  | "superseded"
  | "resolved"
  | "rejected"
  | "unknown";

/** Evidence strength — a conversational "maybe" is a proposal, not a decision. */
export type FactType =
  | "fact"
  | "decision"
  | "proposal"
  | "requirement"
  | "constraint"
  | "hypothesis"
  | "rejected"
  | "unknown";

/** Shared travels with the repo; local never leaves the machine (envelope.ts). */
export type MemoryVisibility = "shared" | "local";

/** One provenance pointer — where a memory item came from. */
export interface MemorySource {
  session: string | null;
  event: string | null;
}

/** One derived piece of project knowledge, fully traceable to its source. */
export interface MemoryItem {
  /** mem_<12 hex> — deterministic from kind + normalized content (idempotent). */
  id: string;
  schemaVersion: number;
  kind: MemoryKind;
  title: string;
  content: string;
  status: MemoryStatus;
  factType: FactType;
  /** 0..1 — separate from factType; a confirmed developer decision scores higher. */
  confidence: number;
  createdAt: string;
  updatedAt: string;
  /** Provenance — REQUIRED and non-empty. Unexplained memory is never created. */
  sourceRefs: MemorySource[];
  relatedFiles: string[];
  relatedEvents: string[];
  relatedSessions: string[];
  supersedes: string | null;
  supersededBy: string | null;
  tags: string[];
  visibility: MemoryVisibility;
}

export const MEMORY_SCHEMA_VERSION = 1;

export const MEMORY_KINDS: readonly MemoryKind[] = [
  "project",
  "architecture",
  "decision",
  "constraint",
  "requirement",
  "current_work",
  "todo",
  "known_issue",
  "completed_work",
  "failed_approach",
  "important_file",
  "integration",
  "dependency",
  "test_gap",
  "handoff",
];

export const MEMORY_STATUSES: readonly MemoryStatus[] = [
  "candidate",
  "active",
  "superseded",
  "resolved",
  "rejected",
  "unknown",
];

export const FACT_TYPES: readonly FactType[] = [
  "fact",
  "decision",
  "proposal",
  "requirement",
  "constraint",
  "hypothesis",
  "rejected",
  "unknown",
];

const KIND_SET = new Set<string>(MEMORY_KINDS);
const STATUS_SET = new Set<string>(MEMORY_STATUSES);
const FACT_SET = new Set<string>(FACT_TYPES);

function isKind(v: string): v is MemoryKind {
  return KIND_SET.has(v);
}

/** Normalize content for a stable, whitespace-insensitive identity. */
function normalize(content: string): string {
  return content.replace(/\s+/gu, " ").trim().toLowerCase();
}

/**
 * Deterministic id from kind + content. Same fact → same id across rebuilds and
 * across sessions, so rebuild is idempotent and duplicates collapse naturally.
 */
export function memoryId(kind: MemoryKind, content: string): string {
  const hash = createHash("sha256").update(`${kind}|${normalize(content)}`).digest("hex");
  return `mem_${hash.slice(0, 12)}`;
}

/** Structural validation → list of human-readable errors ([] = valid). */
export function validateMemoryItem(item: MemoryItem): string[] {
  const errors: string[] = [];
  if (!/^mem_[0-9a-f]{12}$/.test(item.id)) errors.push(`bad id: ${item.id}`);
  if (item.schemaVersion !== MEMORY_SCHEMA_VERSION) {
    errors.push(`schemaVersion ${item.schemaVersion} != ${MEMORY_SCHEMA_VERSION}`);
  }
  if (!KIND_SET.has(item.kind)) errors.push(`unknown kind: ${item.kind}`);
  if (!STATUS_SET.has(item.status)) errors.push(`unknown status: ${item.status}`);
  if (!FACT_SET.has(item.factType)) errors.push(`unknown factType: ${item.factType}`);
  if (item.title.trim() === "") errors.push("empty title");
  if (item.content.trim() === "") errors.push("empty content");
  if (typeof item.confidence !== "number" || item.confidence < 0 || item.confidence > 1) {
    errors.push(`confidence out of range: ${item.confidence}`);
  }
  // Provenance is the core promise — never allow an unexplained memory item.
  if (item.sourceRefs.length === 0) errors.push("missing provenance (sourceRefs empty)");
  for (const s of item.sourceRefs) {
    if (s.session === null && s.event === null) errors.push("empty source ref");
  }
  if (item.visibility !== "shared" && item.visibility !== "local") {
    errors.push(`bad visibility: ${item.visibility}`);
  }
  return errors;
}

// ----------------------------------------------------------- frontmatter

function encodeSources(sources: MemorySource[]): string {
  return sources.map((s) => `${s.session ?? "-"}/${s.event ?? "-"}`).join(", ");
}

function decodeSources(raw: string): MemorySource[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "")
    .map((pair) => {
      const slash = pair.indexOf("/");
      const session = slash === -1 ? pair : pair.slice(0, slash);
      const event = slash === -1 ? "-" : pair.slice(slash + 1);
      return {
        session: session === "-" || session === "" ? null : session,
        event: event === "-" || event === "" ? null : event,
      };
    });
}

function encodeList(items: string[]): string {
  return `[${items.join(", ")}]`;
}

function decodeList(raw: string): string[] {
  return raw
    .replace(/^\[|\]$/gu, "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

/** Serialize a memory item to curated Markdown (frontmatter + content body). */
export function serializeMemory(item: MemoryItem): string {
  const lines = [
    "---",
    `id: ${item.id}`,
    `schemaVersion: ${item.schemaVersion}`,
    `kind: ${item.kind}`,
    `title: ${item.title.replace(/\s+/gu, " ").trim()}`,
    `status: ${item.status}`,
    `factType: ${item.factType}`,
    `confidence: ${item.confidence}`,
    `createdAt: ${item.createdAt}`,
    `updatedAt: ${item.updatedAt}`,
    `sources: ${encodeSources(item.sourceRefs)}`,
    `relatedFiles: ${encodeList(item.relatedFiles)}`,
    `relatedEvents: ${encodeList(item.relatedEvents)}`,
    `relatedSessions: ${encodeList(item.relatedSessions)}`,
    ...(item.supersedes !== null ? [`supersedes: ${item.supersedes}`] : []),
    ...(item.supersededBy !== null ? [`supersededBy: ${item.supersededBy}`] : []),
    `tags: ${encodeList(item.tags)}`,
    `visibility: ${item.visibility}`,
    "---",
    "",
  ];
  return lines.join("\n") + item.content.replace(/\s+$/u, "") + "\n";
}

/** Parse curated Markdown back into a memory item; null when unparseable. */
export function parseMemory(text: string): MemoryItem | null {
  const match = /^---\n([\s\S]*?)\n---\n?/u.exec(text);
  if (match === null) return null;
  const fields = new Map<string, string>();
  for (const line of (match[1] as string).split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    fields.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
  }
  const kind = fields.get("kind") ?? "";
  if (!isKind(kind)) return null;
  const schemaVersion = Number(fields.get("schemaVersion") ?? "");
  if (!Number.isInteger(schemaVersion)) return null;
  const confidence = Number(fields.get("confidence") ?? "");
  const status = (fields.get("status") ?? "unknown") as MemoryStatus;
  const factType = (fields.get("factType") ?? "unknown") as FactType;
  const created = fields.get("createdAt") ?? "";
  const supersedes = fields.get("supersedes");
  const supersededBy = fields.get("supersededBy");
  return {
    id: fields.get("id") ?? "",
    schemaVersion,
    kind,
    title: fields.get("title") ?? "",
    status: STATUS_SET.has(status) ? status : "unknown",
    factType: FACT_SET.has(factType) ? factType : "unknown",
    confidence: Number.isFinite(confidence) ? confidence : 0,
    createdAt: created,
    updatedAt: fields.get("updatedAt") ?? created,
    sourceRefs: decodeSources(fields.get("sources") ?? ""),
    relatedFiles: decodeList(fields.get("relatedFiles") ?? "[]"),
    relatedEvents: decodeList(fields.get("relatedEvents") ?? "[]"),
    relatedSessions: decodeList(fields.get("relatedSessions") ?? "[]"),
    supersedes: supersedes !== undefined && supersedes !== "" ? supersedes : null,
    supersededBy: supersededBy !== undefined && supersededBy !== "" ? supersededBy : null,
    tags: decodeList(fields.get("tags") ?? "[]"),
    visibility: fields.get("visibility") === "local" ? "local" : "shared",
    content: text.slice(match[0].length).replace(/^\n/u, "").replace(/\s+$/u, ""),
  };
}
