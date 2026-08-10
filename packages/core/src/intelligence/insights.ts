/**
 * Narrative insights (docs/development-intelligence.md §9–11): how thinking
 * evolved on a task, and the development story over a window. Derived from
 * Project Memory + its temporal chain — chronological, provenance-backed, model-
 * free.
 */
import type { EventLog } from "../store/event-log.js";
import type { MemoryItem } from "../memory/schema.js";
import { keywords, loadMemory } from "./signals.js";

export interface ThinkingStep {
  ts: string;
  status: MemoryItem["status"];
  kind: MemoryItem["kind"];
  text: string;
}

export interface Thinking {
  task: string;
  steps: ThinkingStep[];
  finalDirection: string[];
  rejected: string[];
}

/** How the direction on a task evolved — decisions, proposals, rejections in time order. */
export async function thinkingEvolution(chronicleDir: string, log: EventLog, task: string): Promise<Thinking> {
  const taskKw = new Set(keywords(task));
  const memory = await loadMemory(chronicleDir, log);
  const relevant = memory
    .filter((m) => m.kind === "decision" || m.kind === "failed_approach" || m.kind === "requirement")
    .filter((m) => keywords(`${m.title} ${m.content} ${m.tags.join(" ")}`).some((k) => taskKw.has(k)))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const steps: ThinkingStep[] = relevant.map((m) => ({ ts: m.createdAt, status: m.status, kind: m.kind, text: m.content }));
  const finalDirection = relevant.filter((m) => m.kind === "decision" && m.status === "active").map((m) => m.content);
  const rejected = relevant
    .filter((m) => m.kind === "failed_approach" || (m.kind === "decision" && (m.status === "superseded" || m.status === "rejected")))
    .map((m) => m.content);
  return { task, steps, finalDirection, rejected };
}

export interface Story {
  since: string | null;
  decisions: string[];
  rejected: string[];
  problems: string[];
  completed: string[];
  unresolved: string[];
  currentDirection: string[];
}

/** A development narrative over a time window, grouped from Project Memory. */
export async function developmentStory(
  chronicleDir: string,
  log: EventLog,
  options: { since?: string } = {},
): Promise<Story> {
  const memory = (await loadMemory(chronicleDir, log)).filter(
    (m) => options.since === undefined || m.updatedAt >= (options.since as string),
  );
  const pick = (fn: (m: MemoryItem) => boolean): string[] =>
    memory.filter(fn).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((m) => m.content);
  return {
    since: options.since ?? null,
    decisions: pick((m) => m.kind === "decision" && m.status === "active"),
    rejected: pick((m) => m.kind === "failed_approach" || (m.kind === "decision" && (m.status === "superseded" || m.status === "rejected"))),
    problems: pick((m) => m.kind === "known_issue"),
    completed: pick((m) => m.kind === "completed_work" || m.status === "resolved"),
    unresolved: pick((m) => (m.kind === "known_issue" || m.kind === "todo") && m.status !== "resolved"),
    currentDirection: pick((m) => m.kind === "current_work"),
  };
}
