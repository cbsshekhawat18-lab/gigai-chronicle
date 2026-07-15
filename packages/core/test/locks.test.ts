import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { newId } from "@gigaichronicle/schema";
import { EventLog } from "../src/index.js";
import { WORKSPACE, makeTempChronicleDir, promptEvent } from "./helpers/events.js";

const dirs: string[] = [];
function tempDir(): string {
  const dir = makeTempChronicleDir("chronicle-locks-");
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("per-stream advisory locks (§8)", () => {
  it("a second writer on the same stream in another 'process' is E_LOCKED", async () => {
    const dir = tempDir();
    const session = newId("session");
    const first = await EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
    await first.append([promptEvent(session)]);

    // Simulate a different live process holding the lock: rewrite the lock
    // owner pid to another live pid (our parent), then try to append.
    const locksDir = path.join(dir, ".local", "locks");
    const lockFile = path.join(locksDir, readdirSync(locksDir)[0] as string);
    writeFileSync(
      lockFile,
      JSON.stringify({ pid: process.ppid, acquiredAt: new Date().toISOString() }) + "\n",
    );

    const second = await EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
    await expect(second.append([promptEvent(session)])).rejects.toMatchObject({
      code: "E_LOCKED",
    });
    await second.close();
    await first.close(); // releases (its view of) the lock
  });

  it("a stale lock from a dead pid is reclaimed", async () => {
    const dir = tempDir();
    const session = newId("session");
    const log = await EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
    await log.append([promptEvent(session)]);
    await log.close();

    // Forge a lock held by a pid that cannot be alive.
    const locksDir = path.join(dir, ".local", "locks");
    const lockName = `sessions__${new Date().getUTCFullYear()}`; // any name — use a fresh one
    writeFileSync(
      path.join(locksDir, `${lockName}.lock`),
      JSON.stringify({ pid: 2 ** 22 + 12345, acquiredAt: new Date().toISOString() }) + "\n",
    );

    const reopened = await EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
    await reopened.append([promptEvent(session)]); // reclaims the session lock left by close()… and works
    const events = [];
    for await (const { event } of reopened.scan({ session })) events.push(event);
    expect(events).toHaveLength(2);
    await reopened.close();
  });

  it("close releases locks so the next writer proceeds", async () => {
    const dir = tempDir();
    const session = newId("session");
    const first = await EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
    await first.append([promptEvent(session)]);
    await first.close();

    const locksDir = path.join(dir, ".local", "locks");
    expect(readdirSync(locksDir)).toEqual([]);

    const second = await EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
    await second.append([promptEvent(session)]);
    await second.close();
  });

  it("lock files record their holder for debuggability", async () => {
    const dir = tempDir();
    const log = await EventLog.open(dir, { workspaceId: WORKSPACE, fsyncIntervalMs: 0 });
    await log.append([promptEvent(newId("session"))]);
    const locksDir = path.join(dir, ".local", "locks");
    const lockFile = path.join(locksDir, readdirSync(locksDir)[0] as string);
    const payload = JSON.parse(readFileSync(lockFile, "utf8")) as { pid: number };
    expect(payload.pid).toBe(process.pid);
    await log.close();
  });
});
