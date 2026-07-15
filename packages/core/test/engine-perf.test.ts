/**
 * M5 owns `event-engine.append.p99` (perf/budgets.json): the FULL pipeline —
 * validate → redact → enrich → append — under 5ms p99 on the no-fsync path.
 * Best-of-3 methodology per perf/README.md.
 */
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { newId } from "@gigaichronicle/schema";
import { EventEngine, fixedGitReader } from "../src/index.js";
import { WORKSPACE, makeTempChronicleDir } from "./helpers/events.js";

const budgets = JSON.parse(
  readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../perf/budgets.json"),
    "utf8",
  ),
) as { budgets: Array<{ id: string; budgetMs: number | null }> };
const BUDGET_MS = budgets.budgets.find((b) => b.id === "event-engine.append.p99")
  ?.budgetMs as number;

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("event engine hot path", () => {
  it(`full pipeline p99 < ${BUDGET_MS}ms (best of 3 batches)`, async () => {
    const dir = makeTempChronicleDir("chronicle-engine-perf-");
    dirs.push(dir);
    const engine = await EventEngine.open(dir, {
      workspaceId: WORKSPACE,
      provider: { id: "example-tool", version: "1.0.0" },
      gitReader: fixedGitReader({ head: "9fc1b2a", branch: "main", dirty: [] }),
      extraEnvValues: ["some-harvested-env-secret-1", "another-harvested-value-2"],
      fsyncIntervalMs: 0,
    });
    const session = newId("session");
    const text =
      "Refactor the auth middleware to rotate refresh tokens on every use and " +
      "revoke the token family when reuse is detected. Keep the logic in " +
      "src/auth/refresh.ts and add tests either way. ".repeat(4); // ~1KB realistic prompt

    for (let i = 0; i < 100; i++) {
      await engine.emit({ type: "PromptSubmitted", session, payload: { text } });
    }

    let bestP99 = Number.POSITIVE_INFINITY;
    for (let batch = 0; batch < 3 && bestP99 >= BUDGET_MS; batch++) {
      const durations: number[] = [];
      for (let i = 0; i < 500; i++) {
        const start = performance.now();
        await engine.emit({
          type: "PromptSubmitted",
          session,
          payload: { text: `${text} #${batch}-${i}` },
        });
        durations.push(performance.now() - start);
      }
      durations.sort((a, b) => a - b);
      const p99 = durations[Math.floor(durations.length * 0.99)] as number;
      const median = durations[Math.floor(durations.length * 0.5)] as number;
      // eslint-disable-next-line no-console
      console.log(
        `engine emit batch ${batch}: median ${median.toFixed(3)}ms · p99 ${p99.toFixed(3)}ms`,
      );
      bestP99 = Math.min(bestP99, p99);
    }
    await engine.close();
    expect(bestP99).toBeLessThan(BUDGET_MS);
  });
});
