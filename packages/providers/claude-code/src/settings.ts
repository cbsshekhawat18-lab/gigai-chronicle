/**
 * Hook installation into `.claude/settings.json` — a product moment, not a
 * config chore (capture audit §9.3): merge without clobbering, identify our
 * entries unambiguously, uninstall restores the file to exactly what it
 * would have been.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { CAPTURED_HOOK_EVENTS } from "./hooks.js";

/** Our entries are recognized by this command prefix — never by position. */
const COMMAND_PREFIX = "chronicle capture claude-code --event";

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

function commandFor(eventName: string): string {
  return `${COMMAND_PREFIX} ${eventName}`;
}

/** The exact entries install would add — for showing the diff before consent. */
export function renderInstallPlan(file: string): string[] {
  const settings = load(file);
  const plan: string[] = [];
  for (const eventName of CAPTURED_HOOK_EVENTS) {
    const installed = (settings.hooks?.[eventName] ?? []).some((entry) =>
      entry.hooks?.some((h) => h.command?.startsWith(COMMAND_PREFIX)),
    );
    if (!installed) plan.push(`hooks.${eventName} += { command: "${commandFor(eventName)}" }`);
  }
  return plan;
}

/** Merge our hook entries in; returns true if the file changed. Idempotent. */
export function installHooks(file: string): boolean {
  const settings = load(file);
  settings.hooks = settings.hooks ?? {};
  let changed = false;
  for (const eventName of CAPTURED_HOOK_EVENTS) {
    const entries = (settings.hooks[eventName] = settings.hooks[eventName] ?? []);
    const present = entries.some((entry) =>
      entry.hooks?.some((h) => h.command?.startsWith(COMMAND_PREFIX)),
    );
    if (present) continue;
    entries.push({ hooks: [{ type: "command", command: commandFor(eventName) }] });
    changed = true;
  }
  if (changed) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(settings, null, 2) + "\n", "utf8");
  }
  return changed;
}

export interface WireCaptureResult {
  /** Workspace-relative settings file we wrote, or null when we wrote none. */
  file: string | null;
  /** True when capture is live after this call — including "already was". */
  live: boolean;
  /** True when this call changed a file (drives an honest footprint). */
  changed: boolean;
  scope: "project" | "user" | null;
}

/**
 * Make capture actually run for a workspace — the whole decision in ONE
 * place, so every surface that starts a project (the CLI's `init`, the
 * extension's auto-start) makes it identically.
 *
 * User-scope hooks that already cover this repo win: installing at both
 * scopes makes Claude Code fire every hook twice, which doubles every event.
 */
export function wireCapture(workspaceRoot: string): WireCaptureResult {
  if (renderInstallPlan(settingsPathFor(workspaceRoot, "user")).length === 0) {
    return { file: null, live: true, changed: false, scope: "user" };
  }
  const file = settingsPathFor(workspaceRoot, "project");
  const changed = installHooks(file);
  return {
    file: path.relative(workspaceRoot, file).split(path.sep).join("/"),
    live: true,
    changed,
    scope: "project",
  };
}

/** Where capture stands for a workspace, without changing anything. */
export function captureState(workspaceRoot: string): { live: boolean; scope: "project" | "user" | null } {
  for (const scope of ["project", "user"] as const) {
    if (renderInstallPlan(settingsPathFor(workspaceRoot, scope)).length === 0) {
      return { live: true, scope };
    }
  }
  return { live: false, scope: null };
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
        hooks: entry.hooks?.filter((h) => !h.command?.startsWith(COMMAND_PREFIX)) ?? [],
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
