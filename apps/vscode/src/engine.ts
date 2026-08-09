/**
 * Extension-side engine: everything the views show, computed from the store
 * via pure-fs paths (EventLog scan + Replay Engine). Deliberately NO
 * ChronicleIndex here — the native SQLite module never enters the .vsix
 * (ADR-0008 lazy-loading makes this a packaging property, not a fork).
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  EventLog,
  buildBootstrap,
  buildContextPack,
  buildContinue,
  buildHandoff,
  buildProjectContext,
  capturedPromptByEvent,
  capturedPrompts,
  changesByPrompt,
  fileRisk,
  listMemory,
  listPrompts,
  openWorkspace,
  preflight,
  projectHealth,
  promptHistory,
  promptUsage,
  replaySession,
  sessionEvents,
  stuckWork,
  technicalDebt,
  unfinishedWork,
  whyNot,
  type CapturedPrompt,
  type ContextPack,
  type MemoryItem,
  type PreflightResult,
  type PromptUsageInfo,
  type ReplayFrame,
  type RiskResult,
  type WhyNot,
} from "@gigaichronicle/core";
import type { SessionId, WorkspaceId } from "@gigaichronicle/schema";
import type { IntelligenceSummary, MemorySummary, PromptWithHistory, SessionListItem, SettingsInfo } from "./protocol.js";

/** One attributed prompt for the "why is this file like this?" view. */
export interface WhyEntry {
  eventId: string;
  /**
   * The prompt text that shaped the file. Under metadata-only capture this
   * is the `[METADATA-ONLY]` marker (ADR-0015); null means the body spilled
   * to a blob sidecar past 64KB.
   */
  prompt: string | null;
  session: string | null;
  ts: string | null;
  insertions: number;
  deletions: number;
  /** True when line counts are unavailable (binary file). */
  binary: boolean;
}

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

  /**
   * Store configuration + posture for the Settings page — a read-only
   * projection of `.chronicle/config.json` (ADR-0009). Missing or unreadable
   * config degrades to safe defaults, never an error; the dashboard never
   * writes config (that stays a deliberate CLI action).
   */
  async settings(): Promise<SettingsInfo> {
    const raw = await readFile(path.join(this.chronicleDir, "config.json"), "utf8").catch(() => null);
    let cfg: Record<string, unknown> = {};
    let configReadable = raw !== null;
    if (raw !== null) {
      try {
        cfg = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        cfg = {};
        configReadable = false; // present but corrupt — don't show defaults as truth
      }
    }
    const project = (cfg["project"] ?? {}) as { name?: unknown };
    const capture = (cfg["capture"] ?? {}) as Record<string, unknown>;
    const redaction = (capture["redaction"] ?? {}) as { secrets?: unknown; customPatterns?: unknown };
    const storage = (cfg["storage"] ?? {}) as Record<string, unknown>;
    const retention = (storage["retention"] ?? {}) as { mode?: unknown };
    const digest = (storage["digest"] ?? {}) as { session?: unknown };
    const providersRaw = (capture["providers"] ?? {}) as Record<string, unknown>;
    return {
      configReadable,
      projectName: typeof project.name === "string" ? project.name : null,
      storePath: this.chronicleDir,
      providers: Object.entries(providersRaw).map(([id, mode]) => ({ id, mode: String(mode) })),
      redactSecrets: redaction.secrets !== false, // default on
      customPatterns: Array.isArray(redaction.customPatterns) ? redaction.customPatterns.length : 0,
      visibility: typeof capture["visibility"] === "string" ? (capture["visibility"] as string) : "private",
      gitTrailer: capture["gitTrailer"] === true,
      retention: typeof retention.mode === "string" ? retention.mode : "keep-all",
      sessionDigest: digest.session === true,
    };
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
      // The session you're working in NOW comes first; otherwise newest-first.
      return items.sort((a, b) => {
        if (a.live !== b.live) return a.live ? -1 : 1;
        return (b.startedTs ?? "").localeCompare(a.startedTs ?? "");
      });
    });
  }

  /** Full frame sequence for one session (the webview timeline). */
  async frames(session: SessionId): Promise<ReplayFrame[]> {
    return this.#withLog(async (log) => replaySession(await sessionEvents(log, session)));
  }

  /**
   * Prompts you have actually typed, newest first — the picker behind "Save
   * prompt" (ADR-0014). Without this the library can only be fed by
   * retyping, which is the manual hoarding P1 describes.
   */
  async recentPrompts(limit = 25): Promise<CapturedPrompt[]> {
    return this.#withLog(async (log) => {
      const all = await capturedPrompts(this.chronicleDir, log);
      return all.reverse().slice(0, limit);
    });
  }

  /**
   * The Context Pack for a file (roadmap "Context Pack"): the prompts that
   * shaped it + the decisions from those sessions, as paste-ready Markdown.
   * Pure-fs assembly — Chronicle never calls a model; it briefs the one you do.
   */
  async contextPack(relativePath: string): Promise<ContextPack> {
    const repoRoot = path.dirname(this.chronicleDir);
    return this.#withLog((log) => buildContextPack(this.chronicleDir, log, repoRoot, relativePath));
  }

  /** Onboard a new AI agent: rules + current state + next step (Phase 6). */
  async bootstrap(): Promise<string> {
    const repoRoot = path.dirname(this.chronicleDir);
    return (await this.#withLog((log) => buildBootstrap(this.chronicleDir, log, repoRoot))).markdown;
  }

  /** A ready-to-paste "continue where we left off" prompt. */
  async continueWork(): Promise<string> {
    const repoRoot = path.dirname(this.chronicleDir);
    return (await this.#withLog((log) => buildContinue(this.chronicleDir, log, repoRoot))).markdown;
  }

  /** A development handoff, persisted into memory for the next agent. */
  async handoff(): Promise<string> {
    const repoRoot = path.dirname(this.chronicleDir);
    return (await this.#withLog((log) => buildHandoff(this.chronicleDir, log, repoRoot))).markdown;
  }

  /** A task-scoped AI briefing from Project Memory. */
  async projectContext(task?: string): Promise<string> {
    const repoRoot = path.dirname(this.chronicleDir);
    const opts = task !== undefined && task.trim() !== "" ? { task: task.trim() } : {};
    return (await this.#withLog((log) => buildProjectContext(this.chronicleDir, log, repoRoot, opts))).markdown;
  }

  /** All memory items (persisted store, else freshly derived) — for the view + search. */
  async memoryItems(): Promise<MemoryItem[]> {
    const stored = await listMemory(this.chronicleDir);
    if (stored.length > 0) return stored;
    return this.#withLog(async (log) => (await buildProjectContext(this.chronicleDir, log, path.dirname(this.chronicleDir), { budget: 999999 })).included);
  }

  // ---- Development Intelligence (Phase 9 / DI Phase 5-6) -------------------

  /** Pre-flight briefing for a task (risk, contradictions, previous attempts). */
  async preflight(task: string): Promise<PreflightResult> {
    const repoRoot = path.dirname(this.chronicleDir);
    return this.#withLog((log) => preflight(this.chronicleDir, log, repoRoot, task));
  }

  /** Negative knowledge for a file — what NOT to change and why. */
  async whyNot(relativePath: string): Promise<WhyNot> {
    const repoRoot = path.dirname(this.chronicleDir);
    return this.#withLog((log) => whyNot(this.chronicleDir, log, repoRoot, relativePath));
  }

  /** Explainable risk for a file. */
  async risk(relativePath: string): Promise<RiskResult> {
    const repoRoot = path.dirname(this.chronicleDir);
    return this.#withLog((log) => fileRisk(this.chronicleDir, log, repoRoot, relativePath));
  }

  /** Counts for the Development Intelligence dashboard panel. */
  async intelligenceSummary(): Promise<IntelligenceSummary> {
    return this.#withLog(async (log) => {
      const [health, unfinished, stuck, debt] = await Promise.all([
        projectHealth(this.chronicleDir, log),
        unfinishedWork(this.chronicleDir, log),
        stuckWork(this.chronicleDir, log),
        technicalDebt(this.chronicleDir, log),
      ]);
      return {
        health: health.overall,
        warnings: health.warnings.length,
        unfinished: unfinished.length,
        stuck: stuck.length,
        debt: debt.length,
        topStuck: stuck[0]?.subject ?? null,
      };
    });
  }

  /** Counts by status/kind for the Project Memory dashboard panel. */
  async memorySummary(): Promise<MemorySummary> {
    const items = await this.memoryItems();
    const active = (k: MemoryItem["kind"]): number =>
      items.filter((m) => m.kind === k && m.status === "active").length;
    return {
      total: items.length,
      currentWork: items.filter((m) => m.kind === "current_work").map((m) => m.content).slice(0, 1)[0] ?? null,
      activeDecisions: active("decision"),
      constraints: active("constraint"),
      todos: items.filter((m) => m.kind === "todo" && m.status !== "resolved").length,
      knownIssues: items.filter((m) => m.kind === "known_issue" && m.status !== "resolved").length,
      failedApproaches: items.filter((m) => m.kind === "failed_approach" || (m.kind === "decision" && (m.status === "superseded" || m.status === "rejected"))).length,
      handoffs: items.filter((m) => m.kind === "handoff").length,
    };
  }

  /** One captured prompt's text by event id — behind the dashboard's Compare. */
  async promptText(eventId: string): Promise<string | null> {
    const prompt = await this.#withLog((log) =>
      capturedPromptByEvent(this.chronicleDir, log, eventId),
    );
    return prompt?.text ?? null;
  }

  /**
   * The curated prompt library, each with its version graph and derived
   * lifecycle status — the Prompts view. "used" is observed (capture saw the
   * text submitted), never a click counter; an unreadable log degrades to
   * "saved", not to an error.
   */
  async libraryPrompts(): Promise<PromptWithHistory[]> {
    const base = await listPrompts(this.chronicleDir);
    if (base.length === 0) return [];
    // A failed scan must not masquerade as "saved" — mark status "unknown".
    let usage = new Map<string, PromptUsageInfo>();
    let usageOk = true;
    try {
      usage = await this.#withLog((log) => promptUsage(this.chronicleDir, log));
    } catch {
      usageOk = false;
    }
    return Promise.all(
      base.map(async (p) => {
        const info = usage.get(p.slug);
        return {
          ...p,
          history: await promptHistory(this.chronicleDir, p.slug).catch(() => []),
          status: usageOk ? (info?.status ?? "saved") : "unknown",
          uses: info?.total ?? 0,
          lastUsedTs: info?.lastUsedTs ?? null,
        } satisfies PromptWithHistory;
      }),
    );
  }

  /**
   * Intent attribution for one file (ADR-0013): which prompts shaped it,
   * newest first. Joins core's checkpoint-derived churn with each prompt's
   * text (scanned from the log — pure-fs, no index). Empty when capture
   * wasn't running for this file's history.
   */
  async why(relativePath: string): Promise<WhyEntry[]> {
    const repoRoot = path.dirname(this.chronicleDir);
    const changes = await changesByPrompt(repoRoot, { path: relativePath, limit: 20 });
    if (changes.length === 0) return [];

    // eventId → { text, session, ts } for the attributed prompt events only.
    const wanted = new Set(changes.map((c) => c.eventId));
    const meta = new Map<string, { text: string | null; session: string | null; ts: string }>();
    await this.#withLog(async (log) => {
      for await (const { event } of log.scan({ visibility: "all" })) {
        if (!wanted.has(event.id)) continue;
        const text = (event.payload as Record<string, unknown>)["text"];
        meta.set(event.id, {
          text: typeof text === "string" ? text : null,
          session: event.session ?? null,
          ts: event.ts,
        });
      }
    });

    return changes
      .map((change) => {
        const info = meta.get(change.eventId);
        const binary = change.files.some((f) => f.insertions === null);
        return {
          eventId: change.eventId,
          prompt: info?.text ?? null,
          session: info?.session ?? null,
          ts: info?.ts ?? null,
          insertions: binary ? 0 : change.files.reduce((s, f) => s + (f.insertions ?? 0), 0),
          deletions: binary ? 0 : change.files.reduce((s, f) => s + (f.deletions ?? 0), 0),
          binary,
        };
      })
      .reverse(); // newest first for the UI
  }
}
