import { ChronicleIndex, EventLog } from "@gigaichronicle/core";
import type { ChronicleEvent, SessionId } from "@gigaichronicle/schema";
import {
  EXIT_NOT_A_PROJECT,
  EXIT_OK,
  findChronicleDir,
  printJson,
  resolveWorkspace,
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
    case "AIResponseReceived": {
      const badge = typeof event.actor.model === "string" ? `[${event.actor.model}] ` : "";
      return `${badge}${truncate(text("text"))}`;
    }
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
  options: Record<string, string | string[] | boolean | undefined>,
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
    const events = index.timeline({
      ...(typeof options["since"] === "string" ? { from: options["since"] } : {}),
      ...(typeof options["until"] === "string" ? { to: options["until"] } : {}),
      ...(typeof options["branch"] === "string" ? { branch: options["branch"] } : {}),
      ...(typeof options["session"] === "string"
        ? { session: options["session"] as SessionId }
        : {}),
      ...(Array.isArray(options["type"]) ? { types: options["type"] } : {}),
      ...(typeof options["provider"] === "string" ? { provider: options["provider"] } : {}),
      ...(typeof options["model"] === "string" ? { model: options["model"] } : {}),
      limit: Number(options["limit"] ?? 100),
      latest: options["fromStart"] !== true, // default: the most recent window
    });

    if (global.json === true) {
      printJson("timeline", { count: events.length, events });
    } else if (events.length === 0) {
      const total = (await index.freshness(log)).eventsInLog;
      console.log(
        total === 0
          ? "no events yet — try `chronicle import claude-code` (history) or start a new Claude Code session (live capture)"
          : `no events match this filter (${total} recorded) — note: timestamps are UTC, which runs ~5.5h behind IST; try an earlier --since`,
      );
    } else {
      for (const event of events) {
        console.log(`${event.ts}  ${event.type.padEnd(18)}  ${summarize(event)}`);
      }
      if (events.length === Number(options["limit"] ?? 100) && options["fromStart"] !== true) {
        console.log(`(latest ${events.length} — older events exist: raise --limit, or --from-start for the beginning)`);
      }
    }
    return EXIT_OK;
  } finally {
    index.close();
    await log.close();
  }
}
