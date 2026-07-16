/**
 * `chronicle sessions` — the session history with provider/model badges:
 * which AI tool and which model did the work, at a glance, for every
 * provider Chronicle has ever captured (newest first).
 */
import { ChronicleIndex, EventLog } from "@gigaichronicle/core";
import {
  EXIT_NOT_A_PROJECT,
  EXIT_OK,
  findChronicleDir,
  printJson,
  resolveWorkspace,
} from "../context.js";

export async function runSessionsCommand(
  options: { provider?: string; model?: string },
  global: { json?: boolean },
): Promise<number> {
  const chronicleDir = findChronicleDir(process.cwd());
  if (chronicleDir === null) {
    console.error("not a chronicle project (no .chronicle directory found)");
    return EXIT_NOT_A_PROJECT;
  }
  const log = await EventLog.open(chronicleDir, {
    workspaceId: await resolveWorkspace(chronicleDir),
    fsyncIntervalMs: 0,
  });
  const index = ChronicleIndex.open(chronicleDir);
  try {
    await index.catchUp(log);
    let sessions = index.sessions().reverse(); // newest first
    if (options.provider !== undefined) {
      sessions = sessions.filter((s) => s.providers.includes(options.provider as string));
    }
    if (options.model !== undefined) {
      sessions = sessions.filter((s) => s.models.includes(options.model as string));
    }

    if (global.json === true) {
      printJson("sessions", { count: sessions.length, sessions });
    } else if (sessions.length === 0) {
      console.log(
        options.provider !== undefined || options.model !== undefined
          ? "no sessions match this filter — `chronicle sessions` (no flags) lists everything"
          : "no sessions yet — `chronicle import claude-code` or start a new AI session",
      );
    } else {
      for (const s of sessions) {
        const badges = [
          ...s.providers.map((p) => `[${p}]`),
          ...s.models.map((m) => `[${m}]`),
        ].join(" ");
        let label = s.title;
        if (label === null) {
          const firstPrompt = index.timeline({
            session: s.id as never,
            types: ["PromptSubmitted"],
            limit: 1,
          })[0];
          const text = (firstPrompt?.payload as { text?: unknown } | undefined)?.text;
          label = typeof text === "string" ? text.replace(/\s+/g, " ").slice(0, 64) : null;
        }
        console.log(`${s.id}  ${badges}`);
        console.log(
          `  ${label ?? "(untitled)"} · ${s.events} event(s) · ${s.started?.slice(0, 16).replace("T", " ") ?? "?"} → ${s.ended?.slice(11, 16) ?? "open"}`,
        );
      }
      console.log(`\n${sessions.length} session(s) · filter with --provider <id> or --model <name> · replay with \`chronicle replay <id>\``);
    }
    return EXIT_OK;
  } finally {
    index.close();
    await log.close();
  }
}
