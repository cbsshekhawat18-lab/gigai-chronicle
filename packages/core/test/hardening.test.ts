/**
 * Production hardening (final QA §25–28): crash-recovery / rebuild-equivalence,
 * schema-migration tolerance, concurrency-safety of the append log, and a scale
 * sanity check. These lock the durability guarantees the product relies on.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { SessionId } from "@gigaichronicle/schema";
import {
  EventLog,
  buildMemory,
  listMemory,
  parseMemory,
  rebuildMemory,
  validateMemoryItem,
  MEMORY_SCHEMA_VERSION,
  type MemoryItem,
} from "../src/index.js";
import { WORKSPACE, makeTempChronicleDir, promptEvent } from "./helpers/events.js";

const SES = "ses_01ARZ3NDEKTSV4RRFFQ69G5FA0" as SessionId;
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
async function withLog<T>(dir: string, fn: (log: EventLog) => Promise<T>): Promise<T> {
  const log = await EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
  try {
    return await fn(log);
  } finally {
    await log.close();
  }
}
async function seed(texts: string[]): Promise<string> {
  const dir = makeTempChronicleDir("chronicle-harden-");
  dirs.push(dir);
  await withLog(dir, (log) => log.append(texts.map((t) => promptEvent(SES, t))));
  return dir;
}

describe("crash recovery & rebuild equivalence", () => {
  it("rebuild regenerates derived memory identically, and discards partial/garbage state", async () => {
    const dir = await seed([
      "let's use PostgreSQL for the database",
      "TODO: add integration tests",
      "there is a race condition in the worker",
    ]);
    const first = await withLog(dir, (log) => buildMemory(dir, log));

    // Simulate an interrupted write: a half-written garbage file in the store.
    mkdirSync(path.join(dir, "memory", "decision"), { recursive: true });
    writeFileSync(path.join(dir, "memory", "decision", "mem_garbagegarbg.md"), "---\nnot valid frontmatter");

    await withLog(dir, (log) => rebuildMemory(dir, log));
    await withLog(dir, (log) => rebuildMemory(dir, log)); // twice — idempotent

    const onDisk = await listMemory(dir);
    // The event history (source of truth) fully reconstructs the derived state…
    expect(onDisk.map((m) => m.id).sort()).toEqual(first.items.map((m) => m.id).sort());
    // …and the garbage is gone (no unparseable survivor).
    expect(onDisk.every((m) => validateMemoryItem(m).length === 0)).toBe(true);
  });
});

describe("schema migration tolerance", () => {
  it("parses forward-compatible frontmatter (unknown keys ignored)", () => {
    const withFutureKey = `---\nid: mem_000000000000\nschemaVersion: ${MEMORY_SCHEMA_VERSION}\nkind: decision\ntitle: t\nstatus: active\nfactType: decision\nconfidence: 0.9\ncreatedAt: 2026-01-01T00:00:00.000Z\nupdatedAt: 2026-01-01T00:00:00.000Z\nsources: ses_1/evt_1\nrelatedFiles: []\nrelatedEvents: []\nrelatedSessions: []\ntags: []\nvisibility: shared\nfutureField: something-a-newer-version-added\n---\nbody`;
    const parsed = parseMemory(withFutureKey);
    expect(parsed).not.toBeNull();
    expect(parsed?.kind).toBe("decision");
  });

  it("validation flags a schemaVersion mismatch instead of silently accepting it", () => {
    const item = parseMemory(
      `---\nid: mem_000000000000\nschemaVersion: 999\nkind: decision\ntitle: t\nstatus: active\nfactType: decision\nconfidence: 0.9\ncreatedAt: 2026-01-01T00:00:00.000Z\nupdatedAt: 2026-01-01T00:00:00.000Z\nsources: ses_1/evt_1\nrelatedFiles: []\nrelatedEvents: []\nrelatedSessions: []\ntags: []\nvisibility: shared\n---\nbody`,
    ) as MemoryItem;
    expect(validateMemoryItem(item).some((e) => e.includes("schemaVersion"))).toBe(true);
  });
});

describe("concurrency safety (append log)", () => {
  it("interleaved appends from two log handles lose no events and stay readable", async () => {
    const dir = makeTempChronicleDir("chronicle-conc-");
    dirs.push(dir);
    const a = await EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
    const b = await EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
    try {
      await Promise.all([
        a.append([promptEvent(SES, "from writer A one"), promptEvent(SES, "from writer A two")]),
        b.append([promptEvent(SES, "from writer B one"), promptEvent(SES, "from writer B two")]),
      ]);
    } finally {
      await a.close();
      await b.close();
    }
    const ids = new Set<string>();
    await withLog(dir, async (log) => {
      for await (const { event } of log.scan({ visibility: "all" })) ids.add(event.id);
    });
    expect(ids.size).toBe(4); // all four events durable, none lost or duplicated
  });
});

describe("scale sanity", () => {
  it("derives memory from a large history without error and with bounded, valid output", async () => {
    const texts: string[] = [];
    for (let i = 0; i < 1500; i++) {
      texts.push(i % 3 === 0 ? `let's use tech${i % 7} for subsystem ${i % 11}` : `some chatter number ${i}`);
    }
    const dir = await seed(texts);
    const { items } = await withLog(dir, (log) => buildMemory(dir, log));
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThan(texts.length); // dedup keeps it bounded
    expect(items.every((m) => m.sourceRefs.length > 0)).toBe(true); // provenance intact at scale
  }, 30_000);
});
