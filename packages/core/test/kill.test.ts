/**
 * Real fault injection (§21): a child process appends in a loop and is
 * SIGKILLed mid-flight. The store's promise: at most one torn trailing line,
 * verify() heals it, nothing else is lost or corrupted.
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { newId } from "@gigaichronicle/schema";
import { EventLog } from "../src/index.js";
import { WORKSPACE, makeTempChronicleDir } from "./helpers/events.js";

const CHILD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "helpers/append-child.mjs");

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("kill -9 mid-append", () => {
  it("leaves at most one torn line, healed by verify()", { timeout: 30_000 }, async () => {
    const dir = makeTempChronicleDir("chronicle-kill-");
    dirs.push(dir);
    const session = newId("session");

    const child = spawn(process.execPath, [CHILD, dir, session, WORKSPACE], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    // Wait until the child has demonstrably appended, then let it run a beat
    // longer and kill it as un-gracefully as the platform allows.
    await new Promise<void>((resolve, reject) => {
      child.stdout.on("data", (chunk: Buffer) => {
        if (chunk.toString().includes("APPENDING")) resolve();
      });
      child.on("exit", (code) => reject(new Error(`child exited early (${code})`)));
      setTimeout(() => reject(new Error("child never started appending")), 20_000);
    });
    await new Promise((r) => setTimeout(r, 100));
    child.kill("SIGKILL");
    await new Promise((resolve) => child.on("exit", resolve));

    const log = await EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
    const report = await log.verify();

    // At most one stream needed healing, and no non-tail corruption exists.
    expect(report.healed.length).toBeLessThanOrEqual(1);
    expect(report.problems).toEqual([]);

    // Everything that survived is valid, in order, with no holes in sequence.
    const texts: string[] = [];
    for await (const { event } of log.scan({ session })) {
      if (event.type === "PromptSubmitted") {
        texts.push((event.payload as { text: string }).text);
      }
    }
    expect(texts.length).toBeGreaterThan(0);
    texts.forEach((text, index) => expect(text.startsWith(`prompt ${index} `)).toBe(true));

    // Idempotence after healing.
    expect((await log.verify()).healed).toEqual([]);
    await log.close();
  });
});
