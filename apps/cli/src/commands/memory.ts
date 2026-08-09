/**
 * `chronicle memory` — inspect and rebuild Project Memory (docs/project-memory.md).
 *
 * Memory is DERIVED from the event history and persisted under .chronicle/memory/.
 * `rebuild` regenerates it; the read subcommands (list/search/show/stats) project
 * the persisted store; `conflicts`/`verify` re-derive to report live integrity.
 * Model-free and local; every item carries provenance back to its events.
 */
import {
  EventLog,
  buildMemory,
  detectSecretKinds,
  listMemory,
  readMemory,
  rebuildMemory,
  validateMemoryItem,
  MEMORY_KINDS,
  type MemoryItem,
  type MemoryKind,
  type MemoryStatus,
} from "@gigaichronicle/core";
import {
  EXIT_FAILURE,
  EXIT_NOT_A_PROJECT,
  EXIT_OK,
  EXIT_USAGE,
  findChronicleDir,
  printJson,
  resolveWorkspace,
} from "../context.js";

interface MemoryFlags {
  type?: string;
  status?: string;
  file?: string;
  since?: string;
  includeLocal?: boolean;
}

const ACTIONS = new Set(["list", "search", "show", "verify", "rebuild", "conflicts", "stats"]);

function line(m: MemoryItem): void {
  const when = m.updatedAt.replace("T", " ").slice(0, 16);
  const src = m.sourceRefs[0];
  const prov = src !== undefined ? `${src.session ?? "-"}/${src.event ?? "-"}` : "-";
  console.log(`  [${m.kind}] ${m.title}`);
  console.log(`     ${m.status} · ${m.factType} · conf ${m.confidence} · ${when} · ${m.id} · ${prov}`);
}

async function withLog<T>(chronicleDir: string, fn: (log: EventLog) => Promise<T>): Promise<T> {
  const log = await EventLog.open(chronicleDir, {
    workspaceId: await resolveWorkspace(chronicleDir),
    fsyncIntervalMs: 0,
  });
  try {
    return await fn(log);
  } finally {
    await log.close();
  }
}

function applyFilters(items: MemoryItem[], flags: MemoryFlags): MemoryItem[] {
  return items.filter((m) => {
    if (flags.type !== undefined && m.kind !== flags.type) return false;
    if (flags.status !== undefined && m.status !== flags.status) return false;
    if (flags.file !== undefined && !m.relatedFiles.some((f) => f.includes(flags.file as string))) return false;
    if (flags.since !== undefined && m.updatedAt < flags.since) return false;
    return true;
  });
}

export async function runMemoryCommand(
  action: string | undefined,
  arg: string | undefined,
  flags: MemoryFlags,
  global: { json?: boolean },
): Promise<number> {
  const chronicleDir = findChronicleDir(process.cwd());
  if (chronicleDir === null) {
    console.error("not a chronicle project (no .chronicle directory found)");
    return EXIT_NOT_A_PROJECT;
  }
  if (action === undefined || !ACTIONS.has(action)) {
    console.error(`memory: action must be one of ${[...ACTIONS].join(", ")}`);
    return EXIT_USAGE;
  }
  if (flags.type !== undefined && !MEMORY_KINDS.includes(flags.type as MemoryKind)) {
    console.error(`memory: --type must be one of ${MEMORY_KINDS.join(", ")}`);
    return EXIT_USAGE;
  }
  const includeLocal = flags.includeLocal === true;

  // ---- rebuild: re-derive from the event history, persist, report ----------
  if (action === "rebuild") {
    const result = await withLog(chronicleDir, (log) => rebuildMemory(chronicleDir, log, { includeLocal }));
    if (global.json === true) {
      printJson("memory", { rebuilt: result.items.length, conflicts: result.conflicts.length });
      return EXIT_OK;
    }
    console.log(`rebuilt Project Memory: ${result.items.length} item(s) from the event history.`);
    if (result.conflicts.length > 0) {
      console.log(`  ⚠ ${result.conflicts.length} unresolved conflict(s) — run \`chronicle memory conflicts\`.`);
    }
    return EXIT_OK;
  }

  // ---- conflicts: derive fresh and report standoffs ------------------------
  if (action === "conflicts") {
    const { conflicts } = await withLog(chronicleDir, (log) => buildMemory(chronicleDir, log, { includeLocal }));
    if (global.json === true) {
      printJson("memory", { count: conflicts.length, conflicts });
      return EXIT_OK;
    }
    if (conflicts.length === 0) {
      console.log("no unresolved memory conflicts.");
      return EXIT_OK;
    }
    console.log(`${conflicts.length} unresolved memory conflict(s):\n`);
    conflicts.forEach((c, i) => {
      console.log(`${i + 1}. ${c.kind} — ${c.subject}`);
      console.log(`   A: ${c.a.title}  (${c.a.id})`);
      console.log(`   B: ${c.b.title}  (${c.b.id})`);
    });
    return EXIT_OK;
  }

  // ---- verify: integrity of the persisted store ----------------------------
  if (action === "verify") {
    const items = await listMemory(chronicleDir, { includeLocal });
    const { conflicts } = await withLog(chronicleDir, (log) => buildMemory(chronicleDir, log, { includeLocal }));
    const errors: string[] = [];
    const warnings: string[] = [];
    const ids = new Set(items.map((m) => m.id));
    for (const m of items) {
      for (const e of validateMemoryItem(m)) errors.push(`${m.id}: ${e}`);
      // Secret leakage is a hard failure — memory must never carry a secret.
      const secrets = detectSecretKinds(`${m.title}\n${m.content}`);
      if (secrets.length > 0) errors.push(`${m.id}: possible secret leakage (${secrets.join(", ")})`);
      if (m.supersededBy !== null && !ids.has(m.supersededBy)) warnings.push(`${m.id}: dangling supersededBy ${m.supersededBy}`);
      if (m.supersedes !== null && !ids.has(m.supersedes)) warnings.push(`${m.id}: dangling supersedes ${m.supersedes}`);
      if ((m.kind === "todo" || m.kind === "known_issue") && m.status === "active") {
        // informational only; surfaced as a count below
      }
    }
    if (conflicts.length > 0) warnings.push(`${conflicts.length} unresolved decision conflict(s)`);
    if (global.json === true) {
      printJson("memory", { ok: errors.length === 0, errors, warnings });
      return errors.length === 0 ? EXIT_OK : EXIT_FAILURE;
    }
    console.log("Project Memory Verification\n");
    console.log(`  ${errors.length === 0 ? "✓" : "✗"} schema + provenance (${items.length} item(s))`);
    console.log(`  ${items.every((m) => detectSecretKinds(`${m.title}\n${m.content}`).length === 0) ? "✓" : "✗"} no secret leakage`);
    console.log(`  ${warnings.every((w) => !w.includes("dangling")) ? "✓" : "⚠"} no broken references`);
    console.log(`  ${conflicts.length === 0 ? "✓" : "⚠"} no unresolved conflicts`);
    for (const e of errors) console.log(`  ✗ ${e}`);
    for (const w of warnings) console.log(`  ⚠ ${w}`);
    console.log(`\nStatus: ${errors.length > 0 ? "FAIL" : warnings.length > 0 ? "WARNING" : "OK"}`);
    return errors.length === 0 ? EXIT_OK : EXIT_FAILURE;
  }

  // ---- stats: local diagnostics (no telemetry) -----------------------------
  if (action === "stats") {
    const items = await listMemory(chronicleDir, { includeLocal });
    const by = (k: MemoryKind): number => items.filter((m) => m.kind === k).length;
    const activeDecisions = items.filter((m) => m.kind === "decision" && m.status === "active").length;
    const withProvenance = items.filter((m) => m.sourceRefs.length > 0).length;
    if (global.json === true) {
      const counts: Record<string, number> = {};
      for (const k of MEMORY_KINDS) counts[k] = by(k);
      printJson("memory", {
        total: items.length,
        activeDecisions,
        provenancePct: items.length === 0 ? 100 : Math.round((withProvenance / items.length) * 100),
        counts,
      });
      return EXIT_OK;
    }
    console.log("Project Memory\n");
    console.log(`  Memory items:      ${items.length}`);
    console.log(`  Active decisions:  ${activeDecisions}`);
    console.log(`  Constraints:       ${by("constraint")}`);
    console.log(`  Requirements:      ${by("requirement")}`);
    console.log(`  TODOs:             ${by("todo")}`);
    console.log(`  Known issues:      ${by("known_issue")}`);
    console.log(`  Failed approaches: ${by("failed_approach")}`);
    console.log(`  Handoffs:          ${by("handoff")}`);
    console.log(`  Provenance:        ${items.length === 0 ? 100 : Math.round((withProvenance / items.length) * 100)}%`);
    if (items.length === 0) console.log("\n  (empty — run `chronicle memory rebuild`)");
    return EXIT_OK;
  }

  // ---- show <id> -----------------------------------------------------------
  if (action === "show") {
    if (arg === undefined) {
      console.error("memory show: needs a memory id (e.g. mem_abc123def456)");
      return EXIT_USAGE;
    }
    let found: MemoryItem | null = null;
    for (const kind of MEMORY_KINDS) {
      const m = await readMemory(chronicleDir, kind, arg, { includeLocal });
      if (m !== null) {
        found = m;
        break;
      }
    }
    if (found === null) {
      if (global.json === true) printJson("memory", { found: false });
      else console.error(`no memory item "${arg}"`);
      return global.json === true ? EXIT_OK : EXIT_FAILURE;
    }
    if (global.json === true) {
      printJson("memory", { item: found });
      return EXIT_OK;
    }
    console.log(`Memory ID:      ${found.id}`);
    console.log(`Kind:           ${found.kind}`);
    console.log(`Title:          ${found.title}`);
    console.log(`Status:         ${found.status}`);
    console.log(`Fact type:      ${found.factType}`);
    console.log(`Confidence:     ${found.confidence}`);
    console.log(`Created:        ${found.createdAt}`);
    console.log(`Updated:        ${found.updatedAt}`);
    console.log(`Sources:        ${found.sourceRefs.map((s) => `${s.session ?? "-"}/${s.event ?? "-"}`).join(", ")}`);
    if (found.relatedFiles.length > 0) console.log(`Related files:  ${found.relatedFiles.join(", ")}`);
    if (found.supersedes !== null) console.log(`Supersedes:     ${found.supersedes}`);
    if (found.supersededBy !== null) console.log(`Superseded by:  ${found.supersededBy}`);
    if (found.tags.length > 0) console.log(`Tags:           ${found.tags.join(", ")}`);
    console.log(`\n${found.content}`);
    return EXIT_OK;
  }

  // ---- list / search -------------------------------------------------------
  const all = await listMemory(chronicleDir, { includeLocal });
  let items = applyFilters(all, flags);
  if (action === "search") {
    const q = (arg ?? "").trim().toLowerCase();
    if (q === "") {
      console.error("memory search: needs a query");
      return EXIT_USAGE;
    }
    items = items.filter((m) => `${m.title} ${m.content} ${m.tags.join(" ")}`.toLowerCase().includes(q));
  }
  if (global.json === true) {
    printJson("memory", { count: items.length, items, ...(action === "search" ? { query: arg } : {}) });
    return EXIT_OK;
  }
  if (items.length === 0) {
    console.log(all.length === 0 ? "no Project Memory yet — run `chronicle memory rebuild`." : "no memory items match.");
    return EXIT_OK;
  }
  console.log(`${items.length} memory item(s):\n`);
  for (const m of items) line(m);
  return EXIT_OK;
}

// A tiny re-export so main.ts can validate statuses if needed later.
export type { MemoryStatus };
