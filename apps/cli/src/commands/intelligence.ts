/**
 * `chronicle intelligence <action>` (+ top-level `risk` / `why-not` / `repeat`)
 * — the Development Intelligence layer (docs/development-intelligence.md).
 * Explainable, deterministic, model-free insight over history + Project Memory
 * + git. Every score shows its signals; findings are "detected", never certain.
 */
import path from "node:path";
import {
  EventLog,
  fileRisk,
  repeatedProblems,
  whyNot,
  type RepeatOptions,
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
import { toRepoRelative } from "./why.js";

interface Flags {
  file?: string;
  task?: string;
  since?: string;
}

const ACTIONS = new Set(["risk", "why-not", "repeat"]);

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

const bar = (score: number): string => "█".repeat(Math.round(score / 10)).padEnd(10, "░");

export async function runIntelligenceCommand(
  action: string | undefined,
  target: string | undefined,
  flags: Flags,
  global: { json?: boolean },
): Promise<number> {
  const chronicleDir = findChronicleDir(process.cwd());
  if (chronicleDir === null) {
    console.error("not a chronicle project (no .chronicle directory found)");
    return EXIT_NOT_A_PROJECT;
  }
  if (action === undefined || !ACTIONS.has(action)) {
    console.error(`intelligence: action must be one of ${[...ACTIONS].join(", ")}`);
    return EXIT_USAGE;
  }
  const repoRoot = path.dirname(chronicleDir);

  // ---- repeat: recurring problems across sessions --------------------------
  if (action === "repeat") {
    const opts: RepeatOptions = {};
    if (flags.file !== undefined) opts.file = flags.file;
    if (flags.task !== undefined) opts.task = flags.task;
    if (flags.since !== undefined) opts.since = flags.since;
    const problems = await withLog(chronicleDir, (log) => repeatedProblems(chronicleDir, log, opts));
    if (global.json === true) {
      printJson("intelligence", { count: problems.length, problems });
      return EXIT_OK;
    }
    if (problems.length === 0) {
      console.log("no repeated problems detected across sessions.");
      return EXIT_OK;
    }
    console.log(`${problems.length} repeated problem(s) detected:\n`);
    for (const p of problems) {
      console.log(`▸ ${p.subject}`);
      console.log(`   appeared in ${p.sessions.length} sessions · ${p.occurrences} time(s) · ${p.resolved ? "resolved later" : "NO successful resolution detected"}`);
      console.log(`   first ${p.firstTs.slice(0, 10)} · last ${p.lastTs.slice(0, 10)}`);
      if (p.files.length > 0) console.log(`   related files: ${p.files.slice(0, 6).join(", ")}`);
      if (!p.resolved) console.log("   recommendation: review the previous attempts before trying again.");
      console.log("");
    }
    return EXIT_OK;
  }

  // ---- risk / why-not need a file -----------------------------------------
  if (target === undefined) {
    console.error(`${action}: needs a file (e.g. \`chronicle ${action} src/auth/token.ts\`)`);
    return EXIT_USAGE;
  }
  const rel = toRepoRelative(repoRoot, process.cwd(), target);
  if (rel === null) {
    console.error(`${action}: "${target}" is outside this repository`);
    return EXIT_USAGE;
  }

  if (action === "risk") {
    const risk = await withLog(chronicleDir, (log) => fileRisk(chronicleDir, log, repoRoot, rel));
    if (global.json === true) {
      printJson("intelligence", { file: risk.file, score: risk.score, level: risk.level, signals: risk.signals });
      return EXIT_OK;
    }
    console.log(`RISK — ${risk.file}`);
    console.log(`  ${bar(risk.score)}  ${risk.score}/100  ${risk.level.toUpperCase()}\n`);
    if (risk.signals.length === 0) {
      console.log("  no risk signals from captured history.");
    } else {
      console.log("  Because:");
      for (const s of risk.signals) console.log(`  + [${s.weight}] ${s.detail}`);
    }
    console.log(`\n  ${risk.note}`);
    return EXIT_OK;
  }

  // action === "why-not"
  const wn = await withLog(chronicleDir, (log) => whyNot(chronicleDir, log, repoRoot, rel));
  if (global.json === true) {
    printJson("intelligence", { file: wn.file, riskLevel: wn.riskLevel, empty: wn.empty, reasons: wn.reasons });
    return EXIT_OK;
  }
  console.log(`WHY NOT CHANGE THIS? — ${wn.file}\n`);
  if (wn.empty) {
    console.log("  No recorded decisions, constraints, or failed approaches touch this file.");
    console.log("  That doesn't mean it's safe — just that Chronicle has no negative knowledge yet.");
    return EXIT_OK;
  }
  wn.reasons.forEach((r, i) => console.log(`  ${i + 1}. ${r.text}`));
  console.log(`\n  Risk: ${wn.riskLevel.toUpperCase()}  (run \`chronicle risk ${wn.file}\` for the signals)`);
  return wn.reasons.length > 0 ? EXIT_OK : EXIT_FAILURE;
}
