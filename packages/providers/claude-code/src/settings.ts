/**
 * Hook installation into `.claude/settings.json` — a product moment, not a
 * config chore (capture audit §9.3): merge without clobbering, identify our
 * entries unambiguously, uninstall restores the file to exactly what it
 * would have been.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { CAPTURED_HOOK_EVENTS } from "./hooks.js";
import { CLI_COMMAND, findOnPath, type PathLookupOptions } from "./cli-path.js";

/** Our entries are recognized by this command prefix — never by position. */
const COMMAND_PREFIX = "chronicle capture claude-code --event";

/**
 * Appended to every hook command so a committed `.claude/settings.json` never
 * produces hook errors for a teammate who doesn't have the CLI (ADR-0018).
 * `; exit 0` is the one form that means the same thing in every shell Claude
 * Code runs hooks in — `sh -c` on macOS/Linux, Git Bash on Windows, and
 * PowerShell on Windows without Git Bash — and `chronicle capture` already
 * exits 0 by contract, so nothing real is masked.
 */
const QUIET_IF_ABSENT = "; exit 0";

interface HookEntry {
  matcher?: string;
  hooks: Array<{ type: string; command: string; [k: string]: unknown }>;
  [k: string]: unknown;
}

type SettingsShape = { hooks?: Record<string, HookEntry[]>; [k: string]: unknown };

export function settingsPathFor(workspaceRoot: string, scope: "project" | "user", home?: string): string {
  return scope === "project"
    ? path.join(workspaceRoot, ".claude", "settings.json")
    : path.join(home ?? process.env["HOME"] ?? "", ".claude", "settings.json");
}

function load(file: string): SettingsShape {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as SettingsShape;
  } catch {
    return {};
  }
}

/** The exact command installed for one hook event. */
export function hookCommandFor(eventName: string): string {
  return `${COMMAND_PREFIX} ${eventName}${QUIET_IF_ABSENT}`;
}

function isOurs(command: string | undefined): boolean {
  return command?.startsWith(COMMAND_PREFIX) === true;
}

/** Per event: missing entirely, or present in the pre-ADR-0018 bare form. */
function inspect(settings: SettingsShape): { missing: string[]; legacy: string[] } {
  const missing: string[] = [];
  const legacy: string[] = [];
  for (const eventName of CAPTURED_HOOK_EVENTS) {
    const ours = (settings.hooks?.[eventName] ?? []).flatMap((entry) =>
      (entry.hooks ?? []).filter((h) => isOurs(h.command)),
    );
    if (ours.length === 0) missing.push(eventName);
    else if (!ours.some((h) => h.command === hookCommandFor(eventName))) legacy.push(eventName);
  }
  return { missing, legacy };
}

/** True when every captured event has one of our entries (either form). */
function hooksInstalled(file: string): boolean {
  return inspect(load(file)).missing.length === 0;
}

/** The exact entries install would add or upgrade — shown before consent. */
export function renderInstallPlan(file: string): string[] {
  const { missing, legacy } = inspect(load(file));
  return [
    ...missing.map((e) => `hooks.${e} += { command: "${hookCommandFor(e)}" }`),
    ...legacy.map((e) => `hooks.${e} ~ { command: "${hookCommandFor(e)}" } (quiet when chronicle is absent)`),
  ];
}

/**
 * Merge our hook entries in; returns true if the file changed. Idempotent.
 * Entries in the old bare form are upgraded IN PLACE (same position, same
 * entry) so a teammate without the CLI stops seeing hook errors.
 */
export function installHooks(file: string): boolean {
  const settings = load(file);
  settings.hooks = settings.hooks ?? {};
  let changed = false;
  for (const eventName of CAPTURED_HOOK_EVENTS) {
    const entries = (settings.hooks[eventName] = settings.hooks[eventName] ?? []);
    let present = false;
    for (const entry of entries) {
      for (const hook of entry.hooks ?? []) {
        if (!isOurs(hook.command)) continue;
        present = true;
        if (hook.command !== hookCommandFor(eventName)) {
          hook.command = hookCommandFor(eventName);
          changed = true;
        }
      }
    }
    if (present) continue;
    entries.push({ hooks: [{ type: "command", command: hookCommandFor(eventName) }] });
    changed = true;
  }
  if (changed) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(settings, null, 2) + "\n", "utf8");
  }
  return changed;
}

/**
 * Where capture stands. Installed hooks are NOT proof of capture: they run
 * `chronicle`, so without the CLI on PATH they record nothing.
 *  - "live":        hooks installed and `chronicle` resolves on PATH
 *  - "cli-missing": hooks installed, `chronicle` not on PATH — nothing is kept
 *  - "off":         no hooks
 */
export type CaptureStatus = "live" | "cli-missing" | "off";

export interface CaptureStateOptions extends PathLookupOptions {
  /** Home directory for the user scope (default: $HOME). */
  home?: string;
}

export interface CaptureState {
  /** True only when hooks are installed AND the CLI they call resolves. */
  live: boolean;
  status: CaptureStatus;
  /** Which settings file carries the hooks (null when none does). */
  scope: "project" | "user" | null;
  /** Where `chronicle` resolved on PATH, or null. */
  cliPath: string | null;
}

export interface WireCaptureResult extends CaptureState {
  /** Workspace-relative settings file we wrote, or null when we wrote none. */
  file: string | null;
  /** True when this call changed a file (drives an honest footprint). */
  changed: boolean;
}

function stateFor(scope: "project" | "user" | null, options: CaptureStateOptions): CaptureState {
  if (scope === null) return { live: false, status: "off", scope: null, cliPath: null };
  const cliPath = findOnPath(CLI_COMMAND, options);
  return cliPath === null
    ? { live: false, status: "cli-missing", scope, cliPath: null }
    : { live: true, status: "live", scope, cliPath };
}

/**
 * Make capture actually run for a workspace — the whole decision in ONE
 * place, so every surface that starts a project (the CLI's `init`, the
 * extension's auto-start) makes it identically.
 *
 * User-scope hooks that already cover this repo win: installing at both
 * scopes makes Claude Code fire every hook twice, which doubles every event.
 * The result reports `cli-missing` (not live) when the hooks are in place but
 * the `chronicle` command they call doesn't resolve.
 */
export function wireCapture(workspaceRoot: string, options: CaptureStateOptions = {}): WireCaptureResult {
  if (hooksInstalled(settingsPathFor(workspaceRoot, "user", options.home))) {
    return { ...stateFor("user", options), file: null, changed: false };
  }
  const file = settingsPathFor(workspaceRoot, "project");
  const changed = installHooks(file);
  return {
    ...stateFor("project", options),
    file: path.relative(workspaceRoot, file).split(path.sep).join("/"),
    changed,
  };
}

/** Where capture stands for a workspace, without changing anything. */
export function captureState(workspaceRoot: string, options: CaptureStateOptions = {}): CaptureState {
  for (const scope of ["project", "user"] as const) {
    if (hooksInstalled(settingsPathFor(workspaceRoot, scope, options.home))) return stateFor(scope, options);
  }
  return stateFor(null, options);
}

/** Remove exactly our entries; prunes empty structures. True if changed. */
export function uninstallHooks(file: string): boolean {
  const settings = load(file);
  if (settings.hooks === undefined) return false;
  let changed = false;
  for (const [eventName, entries] of Object.entries(settings.hooks)) {
    const kept = entries
      .map((entry) => ({
        ...entry,
        hooks: entry.hooks?.filter((h) => !isOurs(h.command)) ?? [],
      }))
      .filter((entry) => entry.hooks.length > 0);
    if (kept.length !== entries.length || kept.some((e, i) => e.hooks.length !== entries[i]?.hooks.length)) {
      changed = true;
      if (kept.length === 0) delete settings.hooks[eventName];
      else settings.hooks[eventName] = kept;
    }
  }
  if (changed) {
    if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
    writeFileSync(file, JSON.stringify(settings, null, 2) + "\n", "utf8");
  }
  return changed;
}
