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
