/**
 * `chronicle replay <session>` — THE capability, headless (§10, the M8
 * gate): step through a session in the terminal — conversation, tools,
 * files, and commits interleaved.
 */
import { EventLog, openWorkspace, replaySession, sessionEvents } from "@gigaichronicle/core";
import type { ChronicleEvent, SessionId, TextOrBlob } from "@gigaichronicle/schema";
import { isId } from "@gigaichronicle/schema";
import {
  EXIT_FAILURE,
  EXIT_NOT_A_PROJECT,
  EXIT_OK,
  findChronicleDir,
  printJson,
} from "../context.js";

function clock(ts: string): string {
  return ts.slice(11, 16);
}

function text(value: TextOrBlob | null, max = 100): string {
  if (value === null) return "(not captured at this tier)";
  if (typeof value !== "string") return `(large content: ${value.$blob})`;
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** Render one event as a replay line (the HOMEPAGE.md hero, literally). */
function renderLine(event: ChronicleEvent): string | null {
  const payload = event.payload as Record<string, unknown>;
  switch (event.type) {
    case "SessionStarted":
      return `[${clock(event.ts)}] session  started${payload["title"] !== null ? ` — ${payload["title"] as string}` : ""}`;
    case "SessionEnded":
      return `[${clock(event.ts)}] session  ended (${payload["reason"] as string})`;
    case "PromptSubmitted":
    case "PromptEdited":
      return `[${clock(event.ts)}] you      ${text(payload["text"] as TextOrBlob)}`;
    case "AIResponseReceived":
      return `[${clock(event.ts)}] agent    ${text(payload["text"] as TextOrBlob | null)}`;
    case "ToolExecuted":
      return `[${clock(event.ts)}] tool     ${payload["tool"] as string} → ${payload["outcome"] as string}${payload["summary"] !== null && payload["summary"] !== undefined ? ` (${text(payload["summary"] as TextOrBlob, 60)})` : ""}`;
    case "FileModified":
      return `[${clock(event.ts)}] files    ✏ ${(payload["paths"] as string[]).join(", ")}`;
    case "FilesAccepted":
      return `[${clock(event.ts)}] files    ✓ accepted ${(payload["paths"] as string[]).join(", ")}`;
    case "FilesRejected":
      return `[${clock(event.ts)}] files    ✗ rejected ${(payload["paths"] as string[]).join(", ")}`;
    case "GitCommitCreated":
      return `[${clock(event.ts)}] git      commit ${payload["sha"] as string} "${payload["subject"] as string}"`;
    case "BranchChanged":
      return `[${clock(event.ts)}] git      branch ${(payload["from"] as string | null) ?? "—"} → ${payload["to"] as string}`;
    case "CaptureGap":
      return `[${clock(event.ts)}] ⚠ gap    ${payload["reason"] as string}${payload["detail"] !== null ? ` — ${payload["detail"] as string}` : ""}`;
    default:
      return event.type.startsWith("Ext.") ? `[${clock(event.ts)}] ·        ${event.type}` : null;
  }
}

export async function runReplayCommand(
  target: string,
  options: { at?: string },
  global: { json?: boolean },
): Promise<number> {
  const chronicleDir = findChronicleDir(process.cwd());
  if (chronicleDir === null) {
    console.error("not a chronicle project (no .chronicle directory found)");
    return EXIT_NOT_A_PROJECT;
  }
  if (!isId(target, "session")) {
    console.error(`replay: "${target}" is not a session id (ses_…) — try \`chronicle status\``);
    return EXIT_FAILURE;
  }

  const workspace = await openWorkspace(chronicleDir);
  const log = await EventLog.open(chronicleDir, {
    workspaceId: workspace.workspaceId,
    fsyncIntervalMs: 0,
  });
  try {
    const events = await sessionEvents(log, target as SessionId);
    if (events.length === 0) {
      console.error(`replay: no events for ${target}`);
      return EXIT_FAILURE;
    }
    const frames = replaySession(events);
    const last = frames[frames.length - 1];

    if (global.json === true) {
      const upTo =
        options.at !== undefined ? frames.find((f) => f.at === options.at) ?? null : last;
      printJson("replay", { session: target, frames: frames.length, frame: upTo });
      return EXIT_OK;
    }

    for (const event of events) {
      const line = renderLine(event);
      if (line !== null) console.log(line);
      if (options.at !== undefined && event.id === options.at) break;
    }
    if (last !== undefined) {
      const accepted = last.workingSet.filter((f) => f.status === "accepted").length;
      console.log(
        `\n${frames.length} frame(s) · fidelity ${last.fidelity} · ${last.conversation.length} turn(s) · ${last.tools.length} tool run(s) · ${accepted} file(s) accepted${last.gaps.length > 0 ? ` · ⚠ ${last.gaps.length} gap(s)` : ""}`,
      );
    }
    return EXIT_OK;
  } finally {
    await log.close();
  }
}
