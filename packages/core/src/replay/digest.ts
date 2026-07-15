/**
 * Session digests — the final replay frame, prose-rendered (§10.1, J4: the
 * artifact teammates read in PRs). Generated files declare themselves and
 * regenerate idempotently next to their session stream.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sessionStreamRef, absoluteStreamPath } from "../store/paths.js";
import { withGeneratedMarker } from "../store/generated.js";
import { replaySession, type ReplayFrame } from "./frames.js";
import type { EventLog } from "../store/event-log.js";
import type { ChronicleEvent, SessionId, TextOrBlob } from "@gigaichronicle/schema";

function renderText(text: TextOrBlob | null, max = 500): string {
  if (text === null) return "_(not captured at this tier)_";
  if (typeof text !== "string") return `_(large content: ${text.$blob})_`;
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** Markdown digest of one session from its final frame. */
export function renderSessionDigest(session: SessionId, frames: readonly ReplayFrame[]): string {
  const last = frames[frames.length - 1];
  if (last === undefined) return withGeneratedMarker(`# Session ${session}\n\n_No events._\n`);

  const prompts = last.conversation.filter((t) => t.role === "human");
  const responses = last.conversation.filter((t) => t.role === "agent");
  const accepted = last.workingSet.filter((f) => f.status === "accepted");
  const rejected = last.workingSet.filter((f) => f.status === "rejected");
  const modified = last.workingSet.filter((f) => f.status === "modified");

  const lines: string[] = [
    `# ${last.title ?? "Session"} — \`${session}\``,
    "",
    `> ${last.startedTs ?? "?"} → ${last.endedTs ?? "(open)"} · fidelity: **${last.fidelity}** · ${prompts.length} prompt(s), ${responses.length} response(s), ${last.tools.length} tool run(s)`,
    "",
  ];

  if (last.gaps.length > 0) {
    lines.push("## ⚠ Capture gaps (this record is knowingly incomplete)", "");
    for (const gap of last.gaps) lines.push(`- ${gap.reason}${gap.detail !== null ? ` — ${gap.detail}` : ""}`);
    lines.push("");
  }

  lines.push("## Conversation", "");
  for (const turn of last.conversation) {
    lines.push(`- **${turn.role === "human" ? "you" : "agent"}** (${turn.ts.slice(11, 19)}): ${renderText(turn.text)}`);
  }

  if (last.tools.length > 0) {
    lines.push("", "## Tool runs", "");
    for (const run of last.tools) {
      lines.push(`- \`${run.tool}\` → ${run.outcome}${run.summary !== null ? ` (${renderText(run.summary, 120)})` : ""}`);
    }
  }

  if (last.workingSet.length > 0) {
    lines.push("", "## Files", "");
    for (const f of accepted) lines.push(`- ✅ accepted: \`${f.path}\``);
    for (const f of rejected) lines.push(`- ❌ rejected: \`${f.path}\``);
    for (const f of modified) lines.push(`- ✏️ modified: \`${f.path}\``);
  }

  if (last.git.commits.length > 0) {
    lines.push("", "## Commits during this session", "");
    for (const c of last.git.commits) lines.push(`- \`${c.sha}\` ${c.subject}`);
  }

  return withGeneratedMarker(lines.join("\n") + "\n");
}

/** Collect one session's events (append order) from the log. */
export async function sessionEvents(log: EventLog, session: SessionId): Promise<ChronicleEvent[]> {
  const events: ChronicleEvent[] = [];
  for await (const { event } of log.scan({ session })) events.push(event);
  return events;
}

export interface DigestReport {
  written: string[];
  unchanged: number;
}

/** (Re)generate digests for every session in the store — idempotent. */
export async function generateSessionDigests(
  chronicleDir: string,
  log: EventLog,
): Promise<DigestReport> {
  const sessions = new Set<SessionId>();
  for await (const { event } of log.scan()) {
    if (event.session !== undefined) sessions.add(event.session as SessionId);
  }
  const report: DigestReport = { written: [], unchanged: 0 };
  for (const session of [...sessions].sort()) {
    const frames = replaySession(await sessionEvents(log, session));
    const digest = renderSessionDigest(session, frames);
    const streamFile = absoluteStreamPath(chronicleDir, sessionStreamRef(session));
    const digestFile = streamFile.replace(/\.jsonl$/, ".md");
    const existing = await readFile(digestFile, "utf8").catch(() => null);
    if (existing === digest) {
      report.unchanged += 1;
      continue;
    }
    await writeFile(digestFile, digest, "utf8");
    report.written.push(path.relative(chronicleDir, digestFile).split(path.sep).join("/"));
  }
  return report;
}
