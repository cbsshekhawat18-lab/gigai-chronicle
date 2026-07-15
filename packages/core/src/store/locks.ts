/**
 * Per-stream advisory locks — ARCHITECTURE.md §8.
 *
 * Multiple processes (extension + CLI + hook invocations) may run at once;
 * one writer per stream file is enforced with exclusive-create lock files in
 * `.local/locks/`. A lock names its holder pid; a lock whose pid is no longer
 * alive is stale and is reclaimed (crashed processes must not wedge capture —
 * design law 8).
 */
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { ChronicleError } from "../errors.js";

interface LockPayload {
  pid: number;
  acquiredAt: string;
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means "alive but not ours"; anything else (ESRCH) means gone.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function tryCreate(lockFile: string): Promise<boolean> {
  const payload: LockPayload = { pid: process.pid, acquiredAt: new Date().toISOString() };
  try {
    await writeFile(lockFile, JSON.stringify(payload) + "\n", { flag: "wx" });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
}

/**
 * Acquire the advisory lock `name` under `dir`. Throws `E_LOCKED` when a
 * live process holds it; reclaims stale locks from dead processes.
 */
export async function acquireLock(dir: string, name: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  const lockFile = path.join(dir, name);

  if (await tryCreate(lockFile)) return lockFile;

  let holder: LockPayload | null = null;
  try {
    holder = JSON.parse(await readFile(lockFile, "utf8")) as LockPayload;
  } catch {
    holder = null; // unreadable lock file — treat as stale
  }

  if (holder !== null && holder.pid !== process.pid && isPidAlive(holder.pid)) {
    throw new ChronicleError(
      "E_LOCKED",
      `stream is locked by live process ${holder.pid} (${lockFile})`,
    );
  }

  await unlink(lockFile).catch(() => undefined);
  if (await tryCreate(lockFile)) return lockFile;
  throw new ChronicleError("E_LOCKED", `lost lock race for ${lockFile}`);
}

/** Release a lock previously returned by {@link acquireLock}. */
export async function releaseLock(lockFile: string): Promise<void> {
  await unlink(lockFile).catch(() => undefined);
}
