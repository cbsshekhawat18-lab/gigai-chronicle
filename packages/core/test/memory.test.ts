/**
 * Project Memory — schema + persistence (Phase 2). The invariants that make
 * memory trustworthy: deterministic ids (idempotent rebuild), required
 * provenance, byte-stable round-trips, and a hard privacy line between the
 * shared (git-tracked) store and the local (git-ignored) one.
 */
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearMemory,
  listMemory,
  memoryId,
  parseMemory,
  readMemory,
  serializeMemory,
  validateMemoryItem,
  writeMemory,
  MEMORY_SCHEMA_VERSION,
  type MemoryItem,
} from "../src/index.js";
import { makeTempChronicleDir } from "./helpers/events.js";

const dirs: string[] = [];
function tempDir(): string {
  const dir = makeTempChronicleDir("chronicle-memory-");
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function item(over: Partial<MemoryItem> = {}): MemoryItem {
  const content = over.content ?? "Use PostgreSQL as the primary database.";
  const kind = over.kind ?? "decision";
  return {
    id: memoryId(kind, content),
    schemaVersion: MEMORY_SCHEMA_VERSION,
    kind,
    title: "Use PostgreSQL",
    content,
    status: "active",
    factType: "decision",
    confidence: 0.9,
    createdAt: "2026-08-09T10:00:00.000Z",
    updatedAt: "2026-08-09T10:00:00.000Z",
    sourceRefs: [{ session: "ses_1", event: "evt_1" }],
    relatedFiles: ["src/db.ts"],
    relatedEvents: ["evt_1"],
    relatedSessions: ["ses_1"],
    supersedes: null,
    supersededBy: null,
    tags: ["database", "postgres"],
    visibility: "shared",
    ...over,
  };
}

describe("memory schema", () => {
  it("derives a deterministic id from kind + content (idempotent, whitespace-insensitive)", () => {
    const a = memoryId("decision", "Use PostgreSQL as the primary database.");
    const b = memoryId("decision", "  use   postgresql   as the PRIMARY database.  ");
    const c = memoryId("constraint", "Use PostgreSQL as the primary database.");
    expect(a).toMatch(/^mem_[0-9a-f]{12}$/);
    expect(b).toBe(a); // same fact → same id (dedup + no rebuild churn)
    expect(c).not.toBe(a); // kind is part of identity
  });

  it("round-trips through serialize → parse byte-stably", () => {
    const original = item({
      supersedes: "mem_000000000000",
      sourceRefs: [
        { session: "ses_1", event: "evt_1" },
        { session: null, event: "evt_2" },
      ],
    });
    const parsed = parseMemory(serializeMemory(original));
    expect(parsed).not.toBeNull();
    expect(parsed).toEqual(original);
    // A second serialize is identical — the property rebuild depends on.
    expect(serializeMemory(parsed as MemoryItem)).toBe(serializeMemory(original));
  });

  it("requires provenance and rejects malformed items", () => {
    expect(validateMemoryItem(item())).toEqual([]);
    expect(validateMemoryItem(item({ sourceRefs: [] }))).toContain("missing provenance (sourceRefs empty)");
    expect(validateMemoryItem(item({ confidence: 1.5 })).some((e) => e.includes("confidence"))).toBe(true);
    expect(validateMemoryItem(item({ content: "   " })).some((e) => e.includes("empty content"))).toBe(true);
  });

  it("returns null on unparseable text", () => {
    expect(parseMemory("no frontmatter")).toBeNull();
    expect(parseMemory("---\nkind: not-a-kind\nschemaVersion: 1\n---\nx")).toBeNull();
  });
});

describe("memory store", () => {
  it("writes shared memory under memory/<kind>/ and reads it back", async () => {
    const dir = tempDir();
    const it1 = item();
    await writeMemory(dir, it1);
    expect(existsSync(path.join(dir, "memory", "decision", `${it1.id}.md`))).toBe(true);
    expect(await readMemory(dir, "decision", it1.id)).toEqual(it1);
  });

  it("keeps local (private-derived) memory out of the shared, git-tracked store", async () => {
    const dir = tempDir();
    const local = item({ content: "Internal token rotation cadence.", visibility: "local", factType: "fact" });
    await writeMemory(dir, local);
    // Local lands under .local/ (git-ignored), never under memory/.
    expect(existsSync(path.join(dir, ".local", "memory", "decision", `${local.id}.md`))).toBe(true);
    expect(existsSync(path.join(dir, "memory", "decision", `${local.id}.md`))).toBe(false);
    // A default (shared) list must NOT surface it; an owner read can opt in.
    expect(await listMemory(dir)).toHaveLength(0);
    expect(await readMemory(dir, "decision", local.id)).toBeNull();
    expect(await readMemory(dir, "decision", local.id, { includeLocal: true })).toEqual(local);
    expect(await listMemory(dir, { includeLocal: true })).toHaveLength(1);
  });

  it("lists deterministically and filters by kind; clear removes derived memory", async () => {
    const dir = tempDir();
    await writeMemory(dir, item({ content: "b decision", kind: "decision" }));
    await writeMemory(dir, item({ content: "a decision", kind: "decision" }));
    await writeMemory(dir, item({ content: "a todo", kind: "todo", factType: "unknown" }));
    const all = await listMemory(dir);
    expect(all).toHaveLength(3);
    // Deterministic order: by kind then id.
    expect(all.map((m) => m.kind)).toEqual(["decision", "decision", "todo"]);
    expect(await listMemory(dir, { kind: "todo" })).toHaveLength(1);

    await clearMemory(dir);
    expect(await listMemory(dir)).toEqual([]);
  });
});
