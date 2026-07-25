/**
 * `chronicle knowledge` — the decisions and TODOs buried in your sessions,
 * surfaced with provenance. Rule-based, model-free, exact-source (roadmap
 * "Knowledge"). Reads your prompts and the agent's responses.
 */
import { EventLog, extractKnowledge, type KnowledgeItem } from "@gigaichronicle/core";
import {
  EXIT_NOT_A_PROJECT,
  EXIT_OK,
  EXIT_USAGE,
  findChronicleDir,
  printJson,
  resolveWorkspace,
} from "../context.js";

function render(list: KnowledgeItem[]): void {
  for (const k of list) {
    const when = k.ts.replace("T", " ").slice(0, 16);
    console.log(`  ${k.text}`);
    console.log(`     ${k.role} · ${when} · ${k.confidence} · chronicle inspect ${k.eventId}`);
  }
}

export async function runKnowledgeCommand(
  options: { type?: string; session?: string },
  global: { json?: boolean },
): Promise<number> {
  const chronicleDir = findChronicleDir(process.cwd());
  if (chronicleDir === null) {
    console.error("not a chronicle project (no .chronicle directory found)");
    return EXIT_NOT_A_PROJECT;
  }
  if (options.type !== undefined && options.type !== "decision" && options.type !== "todo") {
    console.error(`knowledge: --type must be "decision" or "todo", got "${options.type}"`);
    return EXIT_USAGE;
  }

  const log = await EventLog.open(chronicleDir, {
    workspaceId: await resolveWorkspace(chronicleDir),
    fsyncIntervalMs: 0,
  });
  try {
    const items = await extractKnowledge(chronicleDir, log, {
      ...(options.type !== undefined ? { kind: options.type as "decision" | "todo" } : {}),
      ...(options.session !== undefined ? { session: options.session } : {}),
    });

    if (global.json === true) {
      printJson("knowledge", { count: items.length, items });
      return EXIT_OK;
    }
    if (items.length === 0) {
      console.log(
        "no decisions or TODOs found in the captured record yet.\n" +
          '  knowledge reads your prompts and the agent\'s responses for high-signal phrasings\n' +
          '  ("let\'s use X", "TODO", "instead of Y") — it grows as you work, and shows the\n' +
          "  exact source line so you judge it, never a paraphrase.",
      );
      return EXIT_OK;
    }

    const decisions = items.filter((i) => i.kind === "decision");
    const todos = items.filter((i) => i.kind === "todo");
    if (decisions.length > 0) {
      console.log(`decisions (${decisions.length}):\n`);
      render(decisions);
      if (todos.length > 0) console.log("");
    }
    if (todos.length > 0) {
      console.log(`todos (${todos.length}):\n`);
      render(todos);
    }
    return EXIT_OK;
  } finally {
    await log.close();
  }
}
