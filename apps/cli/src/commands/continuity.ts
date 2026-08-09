/**
 * `chronicle project context`, `bootstrap`, `handoff`, `continue` — the AI
 * continuity surface (docs/ai-continuity.md). Each renders paste-ready Markdown
 * from Project Memory + the Context Engine so a new AI (any model) can pick up
 * the project without the developer re-explaining it. Model-free and local.
 */
import { spawn } from "node:child_process";
import {
  EventLog,
  buildBootstrap,
  buildContinue,
  buildHandoff,
  buildProjectContext,
  type ContinuityOptions,
} from "@gigaichronicle/core";
import {
  EXIT_NOT_A_PROJECT,
  EXIT_OK,
  EXIT_USAGE,
  findChronicleDir,
  printJson,
  resolveWorkspace,
} from "../context.js";
import path from "node:path";

interface Flags {
  task?: string;
  file?: string;
  budget?: string;
  since?: string;
  compact?: boolean;
  full?: boolean;
  copy?: boolean;
  includeLocal?: boolean;
  objective?: string;
}

/** Best-effort system clipboard (darwin/win32/linux); never throws. */
function copyToClipboard(text: string): Promise<boolean> {
  const candidates: Array<[string, string[]]> =
    process.platform === "darwin"
      ? [["pbcopy", []]]
      : process.platform === "win32"
        ? [["clip", []]]
        : [["wl-copy", []], ["xclip", ["-selection", "clipboard"]], ["xsel", ["--clipboard", "--input"]]];
  return new Promise((resolve) => {
    const tryNext = (i: number): void => {
      const entry = candidates[i];
      if (entry === undefined) {
        resolve(false);
        return;
      }
      const child = spawn(entry[0], entry[1]);
      child.on("error", () => tryNext(i + 1));
      child.on("close", (code) => resolve(code === 0));
      child.stdin.end(text);
    };
    tryNext(0);
  });
}

function optionsFrom(flags: Flags): ContinuityOptions {
  const opts: ContinuityOptions = {};
  if (flags.task !== undefined) opts.task = flags.task;
  if (flags.file !== undefined) opts.file = flags.file;
  if (flags.since !== undefined) opts.since = flags.since;
  if (flags.includeLocal === true) opts.includeLocal = true;
  if (flags.compact === true) opts.mode = "compact";
  else if (flags.full === true) opts.mode = "full";
  if (flags.budget !== undefined) {
    const n = Number(flags.budget);
    if (Number.isFinite(n) && n > 0) opts.budget = Math.floor(n);
  }
  return opts;
}

async function withCtx<T>(
  fn: (dir: string, log: EventLog, repoRoot: string) => Promise<T>,
): Promise<T | number> {
  const chronicleDir = findChronicleDir(process.cwd());
  if (chronicleDir === null) {
    console.error("not a chronicle project (no .chronicle directory found)");
    return EXIT_NOT_A_PROJECT;
  }
  const repoRoot = path.dirname(chronicleDir);
  const log = await EventLog.open(chronicleDir, {
    workspaceId: await resolveWorkspace(chronicleDir),
    fsyncIntervalMs: 0,
  });
  try {
    return await fn(chronicleDir, log, repoRoot);
  } finally {
    await log.close();
  }
}

/** Print markdown (or JSON), honor --copy. Copy note goes to stderr so pipes stay clean. */
async function emit(
  command: string,
  markdown: string,
  extra: Record<string, unknown>,
  flags: Flags,
  global: { json?: boolean },
): Promise<number> {
  if (global.json === true) {
    printJson(command, { markdown, ...extra });
    return EXIT_OK;
  }
  process.stdout.write(markdown.endsWith("\n") ? markdown : `${markdown}\n`);
  if (flags.copy === true) {
    const ok = await copyToClipboard(markdown);
    console.error(ok ? "\n(copied to clipboard)" : "\n(clipboard unavailable)");
  }
  return EXIT_OK;
}

export async function runProjectCommand(
  action: string | undefined,
  flags: Flags,
  global: { json?: boolean },
): Promise<number> {
  if (action !== "context") {
    console.error('project: only "context" is supported (e.g. `chronicle project context --task "…"`)');
    return EXIT_USAGE;
  }
  const result = await withCtx(async (dir, log, repoRoot) => {
    const ctx = await buildProjectContext(dir, log, repoRoot, optionsFrom(flags));
    return emit("project-context", ctx.markdown, { empty: ctx.empty, included: ctx.included.length, considered: ctx.considered }, flags, global);
  });
  return typeof result === "number" ? result : result;
}

export async function runBootstrapCommand(flags: Flags, global: { json?: boolean }): Promise<number> {
  const result = await withCtx(async (dir, log, repoRoot) => {
    const doc = await buildBootstrap(dir, log, repoRoot, optionsFrom(flags));
    return emit("bootstrap", doc.markdown, { empty: doc.empty }, flags, global);
  });
  return typeof result === "number" ? result : result;
}

export async function runContinueCommand(flags: Flags, global: { json?: boolean }): Promise<number> {
  const result = await withCtx(async (dir, log, repoRoot) => {
    const doc = await buildContinue(dir, log, repoRoot, optionsFrom(flags));
    return emit("continue", doc.markdown, { empty: doc.empty }, flags, global);
  });
  return typeof result === "number" ? result : result;
}

export async function runHandoffCommand(flags: Flags, global: { json?: boolean }): Promise<number> {
  const result = await withCtx(async (dir, log, repoRoot) => {
    const opts: ContinuityOptions & { objective?: string } = optionsFrom(flags);
    if (flags.objective !== undefined) opts.objective = flags.objective;
    const doc = await buildHandoff(dir, log, repoRoot, opts);
    return emit("handoff", doc.markdown, { empty: doc.empty, stored: doc.item?.id ?? null }, flags, global);
  });
  return typeof result === "number" ? result : result;
}
