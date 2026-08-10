/**
 * `chronicle` development-intelligence reports: drift, decision-health,
 * unfinished, stuck, debt, learnings, thinking, story, heatmap, graph, health,
 * dna, memory-health, onboarding-test. Deterministic, explainable, model-free.
 * Every command supports --json.
 */
import path from "node:path";
import {
  EventLog,
  decisionDrift,
  decisionHealth,
  developmentDna,
  developmentStory,
  heatmap,
  learningsFrom,
  loadMemory,
  memoryHealth,
  onboardingTest,
  projectHealth,
  stuckWork,
  technicalDebt,
  thinkingEvolution,
  unfinishedWork,
  workGraph,
} from "@gigaichronicle/core";
import {
  EXIT_NOT_A_PROJECT,
  EXIT_OK,
  EXIT_USAGE,
  findChronicleDir,
  printJson,
  resolveWorkspace,
} from "../context.js";

interface Flags {
  task?: string;
  file?: string;
  since?: string;
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

const bar = (score: number): string => "█".repeat(Math.round(score / 10)).padEnd(10, "░");

export async function runInsightsCommand(
  action: string,
  target: string | undefined,
  flags: Flags,
  global: { json?: boolean },
): Promise<number> {
  const chronicleDir = findChronicleDir(process.cwd());
  if (chronicleDir === null) {
    console.error("not a chronicle project (no .chronicle directory found)");
    return EXIT_NOT_A_PROJECT;
  }
  const repoRoot = path.dirname(chronicleDir);
  const json = global.json === true;
  const emit = (payload: Record<string, unknown>): number => {
    printJson("intelligence", payload);
    return EXIT_OK;
  };

  switch (action) {
    case "drift": {
      const drift = await withLog(chronicleDir, (log) => decisionDrift(chronicleDir, log));
      if (json) return emit({ count: drift.length, drift });
      if (drift.length === 0) {
        console.log("no decision drift detected.");
        return EXIT_OK;
      }
      console.log("DECISION DRIFT\n");
      for (const d of drift) console.log(`⚠ ${d.level}: ${d.decision}\n   evidence: ${d.evidence}\n`);
      return EXIT_OK;
    }
    case "decision-health":
    case "decisions": {
      const h = await withLog(chronicleDir, (log) => decisionHealth(chronicleDir, log));
      if (json) return emit(h as unknown as Record<string, unknown>);
      console.log(`DECISION HEALTH\n  active: ${h.active}  healthy: ${h.healthy}  aging: ${h.aging}  stale: ${h.stale}  conflicting: ${h.conflicting}\n`);
      for (const i of h.items.filter((x) => x.state !== "healthy").slice(0, 10)) {
        console.log(`  [${i.state}] ${i.title}  (age ${i.ageDays}d)`);
      }
      return EXIT_OK;
    }
    case "unfinished": {
      const items = await withLog(chronicleDir, (log) => unfinishedWork(chronicleDir, log));
      if (json) return emit({ count: items.length, items });
      if (items.length === 0) {
        console.log("no unfinished work detected.");
        return EXIT_OK;
      }
      console.log("UNFINISHED WORK\n");
      for (const i of items) console.log(`  [${i.confidence} unfinished] ${i.what}  (last ${i.lastActivity.slice(0, 10)})`);
      return EXIT_OK;
    }
    case "stuck": {
      const items = await withLog(chronicleDir, (log) => stuckWork(chronicleDir, log));
      if (json) return emit({ count: items.length, items });
      if (items.length === 0) {
        console.log("nothing appears stalled.");
        return EXIT_OK;
      }
      console.log("DEVELOPMENT STALLED\n");
      for (const s of items) {
        console.log(`⚠ ${s.subject} — ${s.sessions} sessions, ${s.attempts} attempts, no resolution`);
        for (const c of s.causes) console.log(`   • ${c}`);
        console.log("");
      }
      return EXIT_OK;
    }
    case "debt": {
      const items = await withLog(chronicleDir, (log) => technicalDebt(chronicleDir, log));
      if (json) return emit({ count: items.length, items });
      if (items.length === 0) {
        console.log("no technical debt recorded.");
        return EXIT_OK;
      }
      console.log("TECHNICAL DEBT\n");
      for (const d of items) console.log(`  ${d.level.toUpperCase().padEnd(6)} [${d.area}] ${d.text}`);
      return EXIT_OK;
    }
    case "learnings": {
      const lessons = await withLog(chronicleDir, async (log) => learningsFrom(await loadMemory(chronicleDir, log)));
      if (json) return emit({ count: lessons.length, learnings: lessons });
      if (lessons.length === 0) {
        console.log("no learnings derived yet.");
        return EXIT_OK;
      }
      console.log("PROJECT LEARNINGS\n");
      lessons.forEach((l, i) => console.log(`${i + 1}. ${l.lesson}`));
      return EXIT_OK;
    }
    case "thinking": {
      if (target === undefined) {
        console.error('thinking: needs a task (e.g. `chronicle thinking "authentication"`)');
        return EXIT_USAGE;
      }
      const t = await withLog(chronicleDir, (log) => thinkingEvolution(chronicleDir, log, target));
      if (json) return emit(t as unknown as Record<string, unknown>);
      console.log(`WHAT CHANGED IN YOUR THINKING? — ${t.task}\n`);
      t.steps.forEach((s, i) => console.log(`  ${i + 1}. [${s.status}] ${s.text}`));
      if (t.rejected.length > 0) console.log(`\n  Rejected along the way: ${t.rejected.join("; ")}`);
      if (t.finalDirection.length > 0) console.log(`  Final direction: ${t.finalDirection.join("; ")}`);
      return EXIT_OK;
    }
    case "story": {
      const opts = flags.since !== undefined ? { since: flags.since } : {};
      const s = await withLog(chronicleDir, (log) => developmentStory(chronicleDir, log, opts));
      if (json) return emit(s as unknown as Record<string, unknown>);
      console.log("PROJECT DEVELOPMENT STORY\n");
      const sec = (title: string, items: string[]): void => {
        if (items.length === 0) return;
        console.log(`${title}:`);
        for (const i of items) console.log(`  - ${i}`);
        console.log("");
      };
      sec("Current direction", s.currentDirection);
      sec("Major decisions", s.decisions);
      sec("Rejected approaches", s.rejected);
      sec("Problems", s.problems);
      sec("Completed", s.completed);
      sec("Still unresolved", s.unresolved);
      return EXIT_OK;
    }
    case "heatmap": {
      const entries = await withLog(chronicleDir, (log) => heatmap(chronicleDir, log, repoRoot));
      if (json) return emit({ count: entries.length, entries });
      if (entries.length === 0) {
        console.log("no development activity recorded yet.");
        return EXIT_OK;
      }
      console.log("DEVELOPMENT HEATMAP\n");
      const max = entries[0]?.score ?? 1;
      for (const e of entries.slice(0, 15)) {
        const b = "█".repeat(Math.max(1, Math.round((e.score / max) * 20)));
        console.log(`  ${e.path.padEnd(40).slice(0, 40)} ${b}  (${e.prompts}p ${e.churn}Δ ${e.repeatedFixes}↻)`);
      }
      return EXIT_OK;
    }
    case "graph": {
      const opts: { task?: string; file?: string } = {};
      if (flags.task !== undefined) opts.task = flags.task;
      if (target !== undefined) opts.file = target;
      const g = await withLog(chronicleDir, (log) => workGraph(chronicleDir, log, repoRoot, opts));
      if (json) return emit(g as unknown as Record<string, unknown>);
      console.log(`WORK GRAPH — ${g.root}\n`);
      for (const e of g.edges) console.log(`  ${e.from}  --${e.relation}-->  ${e.to}`);
      if (g.edges.length === 0) console.log("  (no connections found)");
      return EXIT_OK;
    }
    case "health": {
      const h = await withLog(chronicleDir, (log) => projectHealth(chronicleDir, log));
      if (json) return emit(h as unknown as Record<string, unknown>);
      console.log(`PROJECT DEVELOPMENT HEALTH\n  Overall: ${bar(h.overall)} ${h.overall}/100\n`);
      for (const m of h.metrics) console.log(`  ${m.name.padEnd(18)} ${String(m.score).padStart(3)}  ${m.detail}`);
      if (h.warnings.length > 0) {
        console.log("\n  Warnings:");
        for (const w of h.warnings) console.log(`  ⚠ ${w}`);
      }
      return EXIT_OK;
    }
    case "dna": {
      const d = await withLog(chronicleDir, (log) => developmentDna(chronicleDir, log));
      if (json) return emit(d as unknown as Record<string, unknown>);
      console.log("PROJECT DEVELOPMENT DNA\n");
      console.log(`  Change pattern:        ${d.changePattern}`);
      console.log(`  Most active area:      ${d.mostActiveArea ?? "—"}`);
      console.log(`  Most repeated problem: ${d.mostRepeatedProblem ?? "—"}`);
      console.log(`  Technical debt items:  ${d.technicalDebt}`);
      console.log(`  Unresolved decisions:  ${d.unresolvedDecisions}`);
      return EXIT_OK;
    }
    case "memory-health": {
      const h = await withLog(chronicleDir, (log) => memoryHealth(chronicleDir, log));
      if (json) return emit(h as unknown as Record<string, unknown>);
      console.log(`PROJECT MEMORY HEALTH\n  Overall: ${bar(h.overall)} ${h.overall}/100\n`);
      for (const m of h.metrics) console.log(`  ${m.name.padEnd(24)} ${String(m.score).padStart(3)}  ${m.detail}`);
      if (h.recommendations.length > 0) {
        console.log("\n  Recommendations:");
        for (const r of h.recommendations) console.log(`  → ${r}`);
      }
      return EXIT_OK;
    }
    case "onboarding-test": {
      const t = await withLog(chronicleDir, (log) => onboardingTest(chronicleDir, log));
      if (json) return emit(t as unknown as Record<string, unknown>);
      console.log(`NEW AI ONBOARDING TEST\n  Overall: ${bar(t.overall)} ${t.overall}/100\n`);
      for (const m of t.metrics) console.log(`  ${m.name.padEnd(24)} ${String(m.score).padStart(3)}`);
      console.log(`\n  The project is: ${t.ready ? "READY FOR AI HANDOFF" : "NOT YET READY — see gaps"}`);
      if (t.gaps.length > 0) {
        console.log("\n  Gaps:");
        for (const g of t.gaps) console.log(`  ⚠ ${g}`);
      }
      return EXIT_OK;
    }
    default:
      console.error(`unknown intelligence report: ${action}`);
      return EXIT_USAGE;
  }
}
