/**
 * `chronicle agents init` — write small, provider-neutral AI instruction files
 * (AGENTS.md / CLAUDE.md / GEMINI.md) that point any agent at Chronicle's
 * continuity commands. Never clobbers a user-authored file without --force
 * (docs/ai-continuity.md §24).
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AGENT_FILES, agentInstructions } from "@gigaichronicle/core";
import { EXIT_NOT_A_PROJECT, EXIT_OK, EXIT_USAGE, findChronicleDir, printJson } from "../context.js";

async function projectName(chronicleDir: string): Promise<string | undefined> {
  const raw = await readFile(path.join(chronicleDir, "config.json"), "utf8").catch(() => null);
  if (raw === null) return undefined;
  try {
    const cfg = JSON.parse(raw) as { project?: { name?: unknown } };
    return typeof cfg.project?.name === "string" ? cfg.project.name : undefined;
  } catch {
    return undefined;
  }
}

export async function runAgentsCommand(
  action: string | undefined,
  flags: { force?: boolean },
  global: { json?: boolean },
): Promise<number> {
  const chronicleDir = findChronicleDir(process.cwd());
  if (chronicleDir === null) {
    console.error("not a chronicle project (no .chronicle directory found)");
    return EXIT_NOT_A_PROJECT;
  }
  if (action !== "init") {
    console.error('agents: only "init" is supported (e.g. `chronicle agents init [--force]`)');
    return EXIT_USAGE;
  }
  const repoRoot = path.dirname(chronicleDir);
  const body = agentInstructions(await projectName(chronicleDir));

  const written: string[] = [];
  const skipped: string[] = [];
  for (const file of AGENT_FILES) {
    const target = path.join(repoRoot, file);
    const exists = (await readFile(target, "utf8").catch(() => null)) !== null;
    if (exists && flags.force !== true) {
      skipped.push(file);
      continue;
    }
    await writeFile(target, body, "utf8");
    written.push(file);
  }

  if (global.json === true) {
    printJson("agents", { written, skipped });
    return EXIT_OK;
  }
  if (written.length > 0) console.log(`wrote: ${written.join(", ")}`);
  if (skipped.length > 0) {
    console.log(`skipped (already exist — use --force to overwrite): ${skipped.join(", ")}`);
  }
  if (written.length === 0 && skipped.length > 0) {
    console.log("nothing written. Your existing files were left untouched.");
  }
  return EXIT_OK;
}
