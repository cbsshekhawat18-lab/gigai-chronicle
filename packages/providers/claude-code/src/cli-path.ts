/**
 * Does the `chronicle` command the capture hooks call actually resolve?
 *
 * The hooks in `.claude/settings.json` run `chronicle capture claude-code …`
 * through Claude Code's shell, so they only record anything when `chronicle`
 * is on PATH. Hooks installed without the CLI are the silent dead-capture
 * trap: everything LOOKS wired and nothing is kept. This is the same lookup
 * the shell does — POSIX `PATH` + executable bit, Windows `Path`/`PATH` +
 * `PATHEXT` — done without spawning a shell.
 */
import { accessSync, constants, statSync } from "node:fs";
import path from "node:path";

/** The binary the hooks invoke (apps/cli `bin`). */
export const CLI_COMMAND = "chronicle";

/** What a user runs to get it. */
export const CLI_INSTALL_COMMAND = "npm i -g gigai-chronicle";

export interface PathLookupOptions {
  /** Environment to read PATH/PATHEXT from (default: process.env). */
  env?: Record<string, string | undefined>;
  /** Platform semantics to apply (default: process.platform). */
  platform?: NodeJS.Platform;
}

/** Case-insensitive env read — Windows env names are (`Path` vs `PATH`). */
function readEnv(env: Record<string, string | undefined>, name: string, windows: boolean): string | undefined {
  if (!windows) return env[name];
  const key = Object.keys(env).find((k) => k.toUpperCase() === name);
  return key === undefined ? undefined : env[key];
}

function isExecutableFile(file: string, windows: boolean): boolean {
  try {
    if (!statSync(file).isFile()) return false;
    if (!windows) accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Absolute path `command` resolves to on PATH, or null. Empty PATH entries
 * (which a POSIX shell reads as ".") are skipped: the hooks run with the
 * repo as cwd, and a `chronicle` that only "resolves" from the cwd is not
 * an installed CLI.
 */
export function findOnPath(command: string, options: PathLookupOptions = {}): string | null {
  const env = options.env ?? process.env;
  const windows = (options.platform ?? process.platform) === "win32";
  const rawPath = readEnv(env, "PATH", windows) ?? "";
  const dirs = rawPath
    .split(windows ? ";" : ":")
    .map((dir) => (windows ? dir.trim().replace(/^"(.*)"$/, "$1") : dir))
    .filter((dir) => dir !== "");

  // Windows runs `chronicle.cmd` / `.exe` / `.ps1`-less shims via PATHEXT;
  // npm's global install writes chronicle.cmd there.
  const candidates = windows
    ? (() => {
        const exts = (readEnv(env, "PATHEXT", true) ?? ".COM;.EXE;.BAT;.CMD")
          .split(";")
          .map((e) => e.trim())
          .filter((e) => e !== "");
        const hasExt = exts.some((e) => command.toLowerCase().endsWith(e.toLowerCase()));
        return hasExt ? [command] : exts.map((e) => command + e.toLowerCase());
      })()
    : [command];

  for (const dir of dirs) {
    for (const name of candidates) {
      // Native join: the files are on THIS machine's filesystem even when a
      // test applies win32 lookup semantics on a POSIX box.
      const file = path.join(dir, name);
      if (isExecutableFile(file, windows)) return file;
    }
  }
  return null;
}
