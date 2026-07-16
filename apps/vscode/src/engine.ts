/**
 * Extension-side engine: everything the views show, computed from the store
 * via pure-fs paths (EventLog scan + Replay Engine). Deliberately NO
 * ChronicleIndex here — the native SQLite module never enters the .vsix
 * (ADR-0008 lazy-loading makes this a packaging property, not a fork).
 */
import { existsSync } from "node:fs";
import path from "node:path";
import {
  EventLog,
  openWorkspace,
  replaySession,
  sessionEvents,
  type ReplayFrame,
} from "@gigaichronicle/core";
import type { SessionId, WorkspaceId } from "@gigaichronicle/schema";
import type { SessionListItem } from "./protocol.js";

export class ChronicleWorkspace {
  private constructor(
    readonly chronicleDir: string,
    readonly workspaceId: WorkspaceId,
  ) {}

  /** Open the store under a workspace folder; null when not a chronicle project. */
  static async open(folder: string): Promise<ChronicleWorkspace | null> {
    const chronicleDir = path.join(folder, ".chronicle");
    if (!existsSync(path.join(chronicleDir, "config.json"))) return null;
    const context = await openWorkspace(chronicleDir);
    return new ChronicleWorkspace(chronicleDir, context.workspaceId);
  }

  async #withLog<T>(fn: (log: EventLog) => Promise<T>): Promise<T> {
    const log = await EventLog.open(this.chronicleDir, {
      workspaceId: this.workspaceId,
      fsyncIntervalMs: 0,
    });
    try {
      return await fn(log);
    } finally {
      await log.close();
    }
  }

  /** Session summaries for the tree + webview snapshot (newest first). */
  async sessions(): Promise<SessionListItem[]> {
    return this.#withLog(async (log) => {
      const ids = new Set<SessionId>();
      for await (const { event } of log.scan()) {
        if (event.session !== undefined) ids.add(event.session as SessionId);
      }
      const items: SessionListItem[] = [];
      for (const session of ids) {
        const events = await sessionEvents(log, session);
        const frames = replaySession(events);
        const last = frames[frames.length - 1];
        if (last === undefined) continue;
        const providers = new Set<string>();
        const models = new Set<string>();
        for (const event of events) {
          const at = event.meta.provider.lastIndexOf("@");
          providers.add(at <= 0 ? event.meta.provider : event.meta.provider.slice(0, at));
          if (typeof event.actor.model === "string" && !event.actor.model.startsWith("<")) {
            models.add(event.actor.model);
          }
        }
        const firstPrompt = last.conversation.find((t) => t.role === "human");
        const promptPreview =
          firstPrompt !== undefined && typeof firstPrompt.text === "string"
            ? firstPrompt.text.replace(/\s+/g, " ").trim().slice(0, 60)
            : null;
        const label =
          last.title ??
          (promptPreview !== null && promptPreview !== "" ? promptPreview : null) ??
          `Session · ${(last.startedTs ?? "").slice(0, 16).replace("T", " ") || session.slice(0, 12)}`;
        const lastTs = events[events.length - 1]?.ts ?? null;
        const live =
          last.endedTs === null &&
          lastTs !== null &&
          Date.now() - Date.parse(lastTs) < 6 * 3600 * 1000;
        items.push({
          session,
          label,
          live,
          title: last.title,
          startedTs: last.startedTs,
          endedTs: last.endedTs,
          turns: last.conversation.length,
          tools: last.tools.length,
          fidelity: last.fidelity,
          gaps: last.gaps.length,
          providers: [...providers].sort(),
          models: [...models].sort(),
        });
      }
      return items.sort((a, b) => (b.startedTs ?? "").localeCompare(a.startedTs ?? ""));
    });
  }

  /** Full frame sequence for one session (the webview timeline). */
  async frames(session: SessionId): Promise<ReplayFrame[]> {
    return this.#withLog(async (log) => replaySession(await sessionEvents(log, session)));
  }
}
