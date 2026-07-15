import { appendFileSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { newId } from "@gigaichronicle/schema";
import { EventLog } from "../src/index.js";
import { WORKSPACE, makeTempChronicleDir, promptEvent } from "./helpers/events.js";

const dirs: string[] = [];
function tempDir(): string {
  const dir = makeTempChronicleDir("chronicle-verify-");
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function seedSessionFile(dir: string): Promise<{ file: string; count: number }> {
  const log = await EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
  const session = newId("session");
  await log.append([promptEvent(session), promptEvent(session), promptEvent(session)]);
  let file = "";
  for await (const scanned of log.scan({ session })) file = scanned.file;
  await log.close();
  return { file: path.join(dir, ...file.split("/")), count: 3 };
}

describe("EventLog.verify — torn-write healing (§8, §18)", () => {
  it("truncates a torn trailing line and records the loss as a CaptureGap", async () => {
    const dir = tempDir();
    const { file, count } = await seedSessionFile(dir);
    appendFileSync(file, '{"v":1,"id":"evt_TORN_MID_WRI'); // crash mid-append

    const log = await EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
    const report = await log.verify();

    expect(report.healed).toHaveLength(1);
    expect(report.healed[0]?.file.endsWith(".jsonl")).toBe(true);
    expect(report.problems).toEqual([]);

    // The torn bytes are gone; the gap event is appended to the SAME session
    // stream and bound to its session (registry: CaptureGap is shared).
    const events = [];
    for await (const { event } of log.scan()) events.push(event);
    const gaps = events.filter((e) => e.type === "CaptureGap");
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.session).toBeDefined();
    expect((gaps[0]?.payload as { reason: string }).reason).toBe("torn-write");
    expect(events).toHaveLength(count + 1);

    // Idempotent: a second verify heals nothing further.
    const second = await log.verify();
    expect(second.healed).toEqual([]);
    await log.close();
  });

  it("scan tolerates a torn tail before verify has run (skips it, loses nothing else)", async () => {
    const dir = tempDir();
    const { file, count } = await seedSessionFile(dir);
    appendFileSync(file, '{"torn":');

    const log = await EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
    const events = [];
    for await (const { event } of log.scan()) events.push(event);
    expect(events).toHaveLength(count);
    await log.close();
  });

  it("reports (never rewrites) corrupt non-tail lines — the log is not edited in place", async () => {
    const dir = tempDir();
    const { file } = await seedSessionFile(dir);
    const lines = readFileSync(file, "utf8").trim().split("\n");
    lines[1] = '{"not":"an event"}'; // corrupt a MIDDLE line
    const corrupted = lines.join("\n") + "\n";
    rmSync(file);
    appendFileSync(file, corrupted);

    const log = await EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
    const report = await log.verify();
    expect(report.healed).toEqual([]);
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]?.line).toBe(2);
    // File content untouched by verify:
    expect(readFileSync(file, "utf8")).toBe(corrupted);
    await log.close();
  });
});
