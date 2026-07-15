/**
 * Cold-start budget gate — runs in the SERIAL budget phase (`pnpm
 * test:budgets`, its own CI step after the parallel suites), because a
 * saturated 2-core runner mid-storm measures scheduler contention, not
 * Chronicle (perf/README.md methodology). Asserts the delta over bare node
 * boot, best of 5.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "apps", "cli", "dist", "main.js");
const budgets = JSON.parse(readFileSync(path.join(ROOT, "perf", "budgets.json"), "utf8"));
const BUDGET_MS = budgets.budgets.find((b) => b.id === "cli.cold-start").budgetMs;

function bestOf(times, fn) {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < times; i++) {
    const start = performance.now();
    fn();
    best = Math.min(best, performance.now() - start);
  }
  return best;
}

test(`cli cold start: chronicle delta < ${BUDGET_MS}ms over bare node (best of 5, serial phase)`, () => {
  const baseline = bestOf(5, () => execFileSync(process.execPath, ["-e", "0"]));
  const cli = bestOf(5, () => execFileSync(process.execPath, [CLI, "--version"], { stdio: "pipe" }));
  const delta = cli - baseline;
  console.log(
    `cold start: cli ${cli.toFixed(1)}ms · node baseline ${baseline.toFixed(1)}ms · chronicle ${delta.toFixed(1)}ms`,
  );
  assert.ok(delta < BUDGET_MS, `chronicle cold-start delta ${delta.toFixed(1)}ms >= ${BUDGET_MS}ms`);
});
