/**
 * Candidate fuzzing (M5 DoD #2): arbitrary garbage from a provider must
 * never crash the engine and never produce an invalid stored event — it
 * becomes CaptureGaps. After the storm, the store still verifies clean and
 * every stored line parses.
 */
import { rmSync } from "node:fs";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { newId } from "@gigaichronicle/schema";
import { EventEngine, EventLog, fixedGitReader } from "../src/index.js";
import { WORKSPACE, makeTempChronicleDir } from "./helpers/events.js";

describe("engine fuzzing", () => {
  it("never throws, never stores invalid data", { timeout: 60_000 }, async () => {
    const dir = makeTempChronicleDir("chronicle-fuzz-");
    try {
      const engine = await EventEngine.open(dir, {
        workspaceId: WORKSPACE,
        provider: { id: "example-tool", version: "1.0.0" },
        gitReader: fixedGitReader(),
        fsyncIntervalMs: 0,
      });

      const candidateArb = fc.record(
        {
          type: fc.oneof(
            fc.string(),
            fc.constantFrom("PromptSubmitted", "ProjectOpened", "Ext.x.Y", "Ext.bad", ""),
          ),
          payload: fc.anything(),
          session: fc.oneof(
            fc.constant(undefined),
            fc.constant(newId("session")),
            fc.string() as fc.Arbitrary<never>,
          ),
          ts: fc.oneof(fc.constant(undefined), fc.string(), fc.constant("2026-07-14T10:32:11.412Z")),
          visibility: fc.oneof(
            fc.constant(undefined),
            fc.constantFrom("shared" as const, "local" as const),
          ),
        },
        { requiredKeys: ["type", "payload"] },
      );

      await fc.assert(
        fc.asyncProperty(candidateArb, async (candidate) => {
          // Must not throw, whatever comes in.
          const result = await engine.emit(candidate as never);
          expect(typeof result.accepted).toBe("boolean");
        }),
        { numRuns: 200 },
      );
      await engine.close();

      // Invariant: the store never became invalid.
      const log = await EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
      const report = await log.verify();
      expect(report.problems).toEqual([]);
      expect(report.healed).toEqual([]);
      let count = 0;
      for await (const _ of log.scan({ visibility: "all" })) count += 1;
      expect(count).toBeGreaterThan(0); // gaps were recorded, honestly
      await log.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
