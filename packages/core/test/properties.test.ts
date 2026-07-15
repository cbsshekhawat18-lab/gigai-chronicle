/**
 * The two load-bearing property suites (ARCHITECTURE.md §21):
 *   1. Convergence — the same event set produces byte-identical stream files
 *      regardless of append order/interleaving (what makes git-merge sync
 *      trivially correct).
 *   2. Crash-safety — truncation at ANY byte offset (the end-state of
 *      kill-mid-write) loses at most the torn tail; verify() heals and the
 *      remaining events are a prefix of what was written.
 */
import { readFileSync, readdirSync, rmSync, statSync, truncateSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { newId, parseChronicleEventLine, type ChronicleEvent } from "@gigaichronicle/schema";
import { EventLog } from "../src/index.js";
import { WORKSPACE, makeTempChronicleDir, promptEvent } from "./helpers/events.js";

function listJsonl(dir: string): string[] {
  const out: string[] = [];
  for (const root of ["sessions", ".local/ops"]) {
    const rootDir = path.join(dir, ...root.split("/"));
    let entries: string[] = [];
    try {
      entries = (readdirSync(rootDir, { recursive: true }) as string[]).map(String);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.endsWith(".jsonl")) out.push(path.join(root, entry));
    }
  }
  return out.sort();
}

async function writeAll(dir: string, events: readonly ChronicleEvent[]): Promise<void> {
  const log = await EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
  await log.append(events);
  await log.close();
}

describe("store properties", () => {
  it("convergence: any interleaving of the same events yields identical stream files", async () => {
    const sessionA = newId("session");
    const sessionB = newId("session");
    const eventsA = [promptEvent(sessionA), promptEvent(sessionA), promptEvent(sessionA)];
    const eventsB = [promptEvent(sessionB), promptEvent(sessionB), promptEvent(sessionB)];

    await fc.assert(
      fc.asyncProperty(
        // A random interleaving: pick which stream advances at each step.
        fc.array(fc.boolean(), { minLength: 6, maxLength: 6 }),
        async (order) => {
          const interleaved: ChronicleEvent[] = [];
          let ai = 0;
          let bi = 0;
          for (const pickA of order) {
            if (pickA && ai < eventsA.length) interleaved.push(eventsA[ai++] as ChronicleEvent);
            else if (bi < eventsB.length) interleaved.push(eventsB[bi++] as ChronicleEvent);
          }
          while (ai < eventsA.length) interleaved.push(eventsA[ai++] as ChronicleEvent);
          while (bi < eventsB.length) interleaved.push(eventsB[bi++] as ChronicleEvent);

          const dirOrdered = makeTempChronicleDir("prop-a-");
          const dirInterleaved = makeTempChronicleDir("prop-b-");
          try {
            await writeAll(dirOrdered, [...eventsA, ...eventsB]);
            await writeAll(dirInterleaved, interleaved);

            const filesA = listJsonl(dirOrdered);
            const filesB = listJsonl(dirInterleaved);
            expect(filesB).toEqual(filesA);
            for (const file of filesA) {
              expect(readFileSync(path.join(dirInterleaved, file), "utf8")).toBe(
                readFileSync(path.join(dirOrdered, file), "utf8"),
              );
            }
          } finally {
            rmSync(dirOrdered, { recursive: true, force: true });
            rmSync(dirInterleaved, { recursive: true, force: true });
          }
        },
      ),
      { numRuns: 12 },
    );
  });

  it("crash-safety: truncation at any offset loses at most the torn tail; verify() heals", async () => {
    const session = newId("session");
    const written = [
      promptEvent(session),
      promptEvent(session),
      promptEvent(session),
      promptEvent(session),
    ];
    const seedDir = makeTempChronicleDir("prop-crash-seed-");
    await writeAll(seedDir, written);
    const relFile = listJsonl(seedDir)[0] as string;
    const seedFile = path.join(seedDir, relFile);
    const fullSize = statSync(seedFile).size;
    const fullContent = readFileSync(seedFile);

    try {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 0, max: fullSize }), async (cutAt) => {
          const dir = makeTempChronicleDir("prop-crash-");
          try {
            // Recreate the stream then simulate the crash end-state.
            const file = path.join(dir, relFile);
            const { mkdirSync, writeFileSync } = await import("node:fs");
            mkdirSync(path.dirname(file), { recursive: true });
            writeFileSync(file, fullContent);
            truncateSync(file, cutAt);

            const log = await EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
            const report = await log.verify();
            expect(report.problems).toEqual([]);

            // Healed file: every line valid; surviving events are a prefix.
            const healedContent = readFileSync(file, "utf8");
            const lines = healedContent === "" ? [] : healedContent.trim().split("\n").filter(Boolean);
            const survivingIds: string[] = [];
            for (const line of lines) {
              const verdict = parseChronicleEventLine(line);
              if (verdict.ok && verdict.event.type === "PromptSubmitted") {
                survivingIds.push(verdict.event.id);
              }
            }
            expect(survivingIds).toEqual(written.slice(0, survivingIds.length).map((e) => e.id));
            // At most one event lost beyond the clean-cut boundary.
            const cleanlyCut = fullContent.subarray(0, cutAt).toString("utf8");
            const completeBeforeCut = cleanlyCut.split("\n").filter(Boolean).length - (cleanlyCut.endsWith("\n") ? 0 : 1);
            expect(survivingIds.length).toBeGreaterThanOrEqual(Math.max(0, completeBeforeCut));
            await log.close();
          } finally {
            rmSync(dir, { recursive: true, force: true });
          }
        }),
        { numRuns: 15 },
      );
    } finally {
      rmSync(seedDir, { recursive: true, force: true });
    }
  });
});
