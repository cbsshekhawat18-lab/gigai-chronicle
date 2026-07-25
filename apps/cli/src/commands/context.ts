/**
 * `chronicle context <file>` — the Context Pack. Assembles a brief from your
 * own history (the prompts that shaped the file + the decisions from those
 * sessions) as paste-ready Markdown, so your AI tool starts with what you
 * already decided instead of you re-explaining it. Model-free; pure assembly.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { EventLog, buildContextPack } from "@gigaichronicle/core";
import {
  EXIT_NOT_A_PROJECT,
  EXIT_OK,
  EXIT_USAGE,
  findChronicleDir,
  printJson,
  resolveWorkspace,
} from "../context.js";
import { toRepoRelative } from "./why.js";

/** Best-effort system clipboard; resolves false when no tool works. */
function copyToClipboard(text: string): Promise<boolean> {
  const candidates: Array<[string, string[]]> =
    process.platform === "darwin"
      ? [["pbcopy", []]]
      : process.platform === "win32"
        ? [["clip", []]]
        : [["xclip", ["-selection", "clipboard"]], ["wl-copy", []]];
  const attempt = ([cmd, args]: [string, string[]]): Promise<boolean> =>
    new Promise((resolve) => {
      const child = spawn(cmd, args, { stdio: ["pipe", "ignore", "ignore"] });
      child.on("error", () => resolve(false));
      child.on("close", (code) => resolve(code === 0));
      child.stdin.end(text);
    });
  return candidates.reduce<Promise<boolean>>(
    (chain, c) => chain.then((done) => (done ? true : attempt(c))),
    Promise.resolve(false),
  );
}

export async function runContextCommand(
  file: string,
  options: { limit?: string; copy?: boolean },
  global: { json?: boolean },
): Promise<number> {
  const chronicleDir = findChronicleDir(process.cwd());
  if (chronicleDir === null) {
    console.error("not a chronicle project (no .chronicle directory found)");
    return EXIT_NOT_A_PROJECT;
  }
  const repoRoot = path.dirname(chronicleDir);
  const target = toRepoRelative(repoRoot, process.cwd(), file);
  if (target === null) {
    console.error(`context: "${file}" is outside this repository`);
    return EXIT_USAGE;
  }
  const limit = Number(options.limit ?? 8);
  if (!Number.isInteger(limit) || limit < 1) {
    console.error(`context: --limit must be a positive integer, got "${options.limit}"`);
    return EXIT_USAGE;
  }

  const log = await EventLog.open(chronicleDir, {
    workspaceId: await resolveWorkspace(chronicleDir),
    fsyncIntervalMs: 0,
  });
  try {
    const pack = await buildContextPack(chronicleDir, log, repoRoot, target, { limit });

    if (global.json === true) {
      printJson("context", {
        file: target,
        empty: pack.empty,
        prompts: pack.prompts,
        knowledge: pack.knowledge,
        markdown: pack.markdown,
      });
      return EXIT_OK;
    }

    // The Markdown IS the deliverable — print it clean so `chronicle context x
    // | pbcopy` works; the copy note goes to stderr.
    process.stdout.write(pack.markdown);
    if (options.copy === true) {
      const copied = await copyToClipboard(pack.markdown);
      console.error(
        copied
          ? "\n✓ copied to clipboard — paste it into your AI tool as the first message"
          : "\n(no clipboard tool found — the brief is printed above)",
      );
    }
    return EXIT_OK;
  } finally {
    await log.close();
  }
}
