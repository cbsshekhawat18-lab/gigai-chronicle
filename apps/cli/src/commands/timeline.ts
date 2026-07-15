import { ChronicleIndex, EventLog } from "@gigaichronicle/core";
import type { ChronicleEvent, SessionId } from "@gigaichronicle/schema";
import {
  EXIT_NOT_A_PROJECT,
  EXIT_OK,
  findChronicleDir,
  printJson,
  resolveWorkspaceId,
} from "../context.js";

/** One-line human summary per event type; falls back to the type name. */
function summarize(event: ChronicleEvent): string {
  const payload = event.payload as Record<string, unknown>;
  const text = (field: string): string =>
    typeof payload[field] === "string" ? (payload[field] as string) : "";
  switch (event.type) {
    case "PromptSubmitted":
    case "PromptEdited":
      return truncate(text("text"));
    case "AIResponseReceived":
      return truncate(text("text"));
    case "ToolExecuted":
      return `${text("tool")} → ${text("outcome") || "?"}`;
    case "GitCommitCreated":
      return `${text("sha")} ${truncate(text("subject"))}`;
    case "BranchChanged":
      return `${text("from") || "—"} → ${text("to")}`;
    case "SessionStarted":
      return truncate(text("title"));
    case "CaptureGap":
      return truncate(text("detail"));
    default:
      return "";
  }
}

function truncate(value: string, max = 72): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export async function runTimelineCommand(
  options: Record<string, string | string[] | undefined>,
  global: { json?: boolean },
): Promise<number> {
  const chronicleDir = findChronicleDir(process.cwd());
  if (chronicleDir === null) {
    console.error("not a chronicle project (no .chronicle directory found)");
    return EXIT_NOT_A_PROJECT;
  }

  const log = await EventLog.open(chronicleDir, {
    workspaceId: resolveWorkspaceId(chronicleDir),
    fsyncIntervalMs: 0,
  });
  const index = ChronicleIndex.open(chronicleDir);
  try {
    await index.catchUp(log);
    const events = index.timeline({
      ...(typeof options["since"] === "string" ? { from: options["since"] } : {}),
      ...(typeof options["until"] === "string" ? { to: options["until"] } : {}),
      ...(typeof options["branch"] === "string" ? { branch: options["branch"] } : {}),
      ...(typeof options["session"] === "string"
        ? { session: options["session"] as SessionId }
        : {}),
      ...(Array.isArray(options["type"]) ? { types: options["type"] } : {}),
      limit: Number(options["limit"] ?? 100),
    });

    if (global.json === true) {
      printJson("timeline", { count: events.length, events });
    } else if (events.length === 0) {
      console.log("no events (capture arrives with the first provider — M7)");
    } else {
      for (const event of events) {
        console.log(`${event.ts}  ${event.type.padEnd(18)}  ${summarize(event)}`);
      }
    }
    return EXIT_OK;
  } finally {
    index.close();
    await log.close();
  }
}
