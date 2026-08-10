/**
 * `chronicle intelligence <action>` (+ top-level `risk` / `why-not` / `repeat`)
 * — the Development Intelligence layer (docs/development-intelligence.md).
 * Explainable, deterministic, model-free insight over history + Project Memory
 * + git. Every score shows its signals; findings are "detected", never certain.
 */
import path from "node:path";
import {
  EventLog,
  changeImpact,
  fileRisk,
  postflight,
  preflight,
  repeatedProblems,
  scopeDrift,
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

const ACTIONS = new Set(["risk", "why-not", "repeat", "impact", "scope", "preflight", "postflight"]);

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

  // ---- preflight <task>: briefing before a change --------------------------
  if (action === "preflight") {
    if (target === undefined) {
      console.error('preflight: needs a task (e.g. `chronicle preflight "replace Redis with PostgreSQL"`)');
      return EXIT_USAGE;
    }
    const pf = await withLog(chronicleDir, (log) => preflight(chronicleDir, log, repoRoot, target));
    if (global.json === true) {
      printJson("intelligence", { task: pf.task, verdict: pf.verdict, riskLevel: pf.riskLevel, contradictions: pf.contradictions, previousAttempts: pf.previousAttempts, relevantDecisions: pf.relevantDecisions, knownRisks: pf.knownRisks, affectedAreas: pf.affectedAreas, recommendations: pf.recommendedReview, suggestedTests: pf.suggestedTests });
      return EXIT_OK;
    }
    process.stdout.write(pf.markdown);
    return EXIT_OK;
  }

  // ---- postflight / scope: analyse the latest session ----------------------
  if (action === "postflight") {
    const pf = await withLog(chronicleDir, (log) => postflight(chronicleDir, log, repoRoot));
    if (global.json === true) {
      printJson("intelligence", { session: pf.session, task: pf.task, status: pf.status, changedFiles: pf.changedFiles, scope: pf.scope, newDecisions: pf.newDecisions, newTodos: pf.newTodos, concerns: pf.concerns });
      return EXIT_OK;
    }
    process.stdout.write(pf.markdown);
    return EXIT_OK;
  }
  if (action === "scope") {
    const sc = await withLog(chronicleDir, (log) => scopeDrift(chronicleDir, log, repoRoot));
    if (global.json === true) {
      printJson("intelligence", sc as unknown as Record<string, unknown>);
      return EXIT_OK;
    }
    console.log(`SCOPE — ${sc.level.toUpperCase()}`);
    if (sc.task !== null) console.log(`  task: ${sc.task}`);
    console.log(`  changed files: ${sc.changedFiles.length}`);
    if (sc.unexpected.length > 0) console.log(`  ⚠ outside expected area: ${sc.unexpected.join(", ")}`);
    console.log(`\n  ${sc.note}`);
    return EXIT_OK;
  }

  // ---- risk / why-not / impact need a file --------------------------------
  if (target === undefined) {
    console.error(`${action}: needs a file (e.g. \`chronicle ${action} src/auth/token.ts\`)`);
    return EXIT_USAGE;
  }
  const rel = toRepoRelative(repoRoot, process.cwd(), target);
  if (rel === null) {
    console.error(`${action}: "${target}" is outside this repository`);
    return EXIT_USAGE;
  }

  if (action === "impact") {
    const im = await withLog(chronicleDir, (log) => changeImpact(chronicleDir, log, repoRoot, rel));
    if (global.json === true) {
      printJson("intelligence", { target: im.target, riskLevel: im.riskLevel, affected: im.affected, historicalDependencies: im.historicalDependencies });
      return EXIT_OK;
    }
    console.log(`CHANGE IMPACT RADAR — ${im.target}`);
    console.log(`  historical risk: ${im.riskLevel.toUpperCase()}\n`);
    if (im.affected.length === 0) {
      console.log("  no co-change history yet.");
    } else {
      console.log("  Potentially affected (by co-change history):");
      for (const a of im.affected.slice(0, 15)) console.log(`  ${a.band.toUpperCase().padEnd(6)} ${a.file}  (${a.coChanges}×)`);
    }
    if (im.historicalDependencies.length > 0) {
      console.log("\n  Historical dependencies:");
      for (const d of im.historicalDependencies) console.log(`  ✓ ${d}`);
    }
    console.log(`\n  ${im.note}`);
    return EXIT_OK;
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
