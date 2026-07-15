/**
 * `chronicle inspect <id|sha>` — the `git show` of chronicle (§14, J3):
 * deep-dive one session, event, or commit.
 */
import path from "node:path";
import {
  ChronicleIndex,
  EventLog,
  openWorkspace,
  recomputeLinks,
  replaySession,
  sessionEvents,
} from "@gigaichronicle/core";
import { GIT_SHA_REGEX, isId, type SessionId } from "@gigaichronicle/schema";
import {
  EXIT_FAILURE,
  EXIT_NOT_A_PROJECT,
  EXIT_OK,
  findChronicleDir,
  printJson,
} from "../context.js";

export async function runInspectCommand(
  target: string,
  global: { json?: boolean },
): Promise<number> {
  const chronicleDir = findChronicleDir(process.cwd());
  if (chronicleDir === null) {
    console.error("not a chronicle project (no .chronicle directory found)");
    return EXIT_NOT_A_PROJECT;
  }
  const workspace = await openWorkspace(chronicleDir);
  const log = await EventLog.open(chronicleDir, {
    workspaceId: workspace.workspaceId,
    fsyncIntervalMs: 0,
  });
  const index = ChronicleIndex.open(chronicleDir);
  try {
    await index.catchUp(log);

    if (isId(target, "session")) {
      const events = await sessionEvents(log, target as SessionId);
      if (events.length === 0) {
        console.error(`inspect: no events for ${target}`);
        return EXIT_FAILURE;
      }
      const frames = replaySession(events);
      const last = frames[frames.length - 1];
      if (global.json === true) {
        printJson("inspect", { kind: "session", session: target, events: events.length, frame: last });
      } else {
        console.log(
          [
            `session   ${target}`,
            `title     ${last?.title ?? "—"}`,
            `span      ${last?.startedTs ?? "?"} → ${last?.endedTs ?? "(open)"}`,
            `fidelity  ${last?.fidelity}${(last?.gaps.length ?? 0) > 0 ? ` · ⚠ ${last?.gaps.length} gap(s)` : ""}`,
            `turns     ${last?.conversation.length} · tools ${last?.tools.length} · files ${last?.workingSet.length} · commits ${last?.git.commits.length}`,
            `replay    chronicle replay ${target}`,
          ].join("\n"),
        );
      }
      return EXIT_OK;
    }

    if (isId(target, "event")) {
      for await (const { event, file } of log.scan({ visibility: "all" })) {
        if (event.id === target) {
          if (global.json === true) printJson("inspect", { kind: "event", file, event });
          else console.log(JSON.stringify(event, null, 2));
          return EXIT_OK;
        }
      }
      console.error(`inspect: event ${target} not found`);
      return EXIT_FAILURE;
    }

    if (GIT_SHA_REGEX.test(target)) {
      await recomputeLinks(path.dirname(chronicleDir), log, index);
      const links = index.commitLinks(target);
      const events = index.timeline({ limit: 10_000 }).filter((e) => e.git.head === target);
      if (global.json === true) {
        printJson("inspect", { kind: "commit", sha: target, links, eventsAtHead: events.length });
      } else {
        console.log(
          [
            `commit    ${target}`,
            links.length > 0
              ? links.map((l) => `linked    ${l.session} (${l.confidence}, ${l.source})`).join("\n")
              : "linked    no session links (no trailer, no dirty-set overlap, no window match)",
            `context   ${events.length} event(s) recorded at this head`,
          ].join("\n"),
        );
      }
      return EXIT_OK;
    }

    console.error(`inspect: "${target}" is not a session id, event id, or commit sha`);
    return EXIT_FAILURE;
  } finally {
    index.close();
    await log.close();
  }
}
