/**
 * Context Pack — brief your AI tool with what you already decided.
 *
 * The pain in AI coding is context loss: every session you re-explain the
 * project. Chronicle already captured the answer, so it assembles a bundle for
 * a file — the prompts that shaped it, and the decisions/TODOs from the
 * sessions that built it — as plain Markdown you paste into your AI tool.
 *
 * Deterministic and model-free: this is pure ASSEMBLY of captured data (the
 * checkpoint-derived attribution of ADR-0013 + rule-based knowledge). Chronicle
 * never calls a model — it makes the model you already use smarter by handing
 * it context that would otherwise be lost. Pure-fs, so the extension can build
 * the same pack the CLI does.
 */
import { changesByPrompt } from "../attribution/why.js";
import type { EventLog } from "../store/event-log.js";
import { extractKnowledge, resolveEventText, type KnowledgeItem } from "./knowledge.js";

/** A prompt that shaped the file, with its churn and text. */
export interface ContextPackPrompt {
  eventId: string;
  ts: string | null;
  session: string | null;
  text: string | null;
  churn: string;
}

export interface ContextPack {
  file: string;
  prompts: ContextPackPrompt[];
  knowledge: KnowledgeItem[];
  /** The assembled brief, ready to paste into an AI tool. */
  markdown: string;
  /** True when nothing was captured for this file — the pack is honestly empty. */
  empty: boolean;
}

export interface ContextPackOptions {
  /** Max shaping prompts to include (newest scan; default 8). */
  limit?: number;
}

/** "+12 −3" for one turn, summed across the files in scope. Binary → "bin". */
function churn(files: { insertions: number | null; deletions: number | null }[]): string {
  if (files.some((f) => f.insertions === null)) return "bin";
  const plus = files.reduce((s, f) => s + (f.insertions ?? 0), 0);
  const minus = files.reduce((s, f) => s + (f.deletions ?? 0), 0);
  return `+${plus} −${minus}`;
}

function oneLine(text: string, max = 100): string {
  const flat = text.replace(/\s+/gu, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function whenOf(ts: string | null): string {
  return ts === null ? "unknown" : ts.replace("T", " ").slice(0, 16);
}

/**
 * Build a context pack for one repo-relative file. Joins the checkpoint-derived
 * shaping prompts (ADR-0013) with their text and with the decisions/TODOs from
 * the same sessions — everything the AI would want to know before touching it.
 */
export async function buildContextPack(
  chronicleDir: string,
  log: EventLog,
  repoRoot: string,
  file: string,
  options: ContextPackOptions = {},
): Promise<ContextPack> {
  const changes = await changesByPrompt(repoRoot, { path: file, limit: options.limit ?? 8 });

  // eventId → {text, session, ts} for the shaping prompts (pure-fs scan).
  // resolveEventText follows a blob ref, so a >64KB prompt spilled to a blob
  // reads its real text — not "(prompt text unavailable)".
  const wanted = new Set(changes.map((c) => c.eventId));
  const meta = new Map<string, { text: string | null; session: string | null; ts: string }>();
  if (wanted.size > 0) {
    for await (const scanned of log.scan({ visibility: "all" })) {
      const { event } = scanned;
      if (!wanted.has(event.id)) continue;
      meta.set(event.id, {
        text: await resolveEventText(chronicleDir, scanned),
        session: event.session ?? null,
        ts: event.ts,
      });
    }
  }

  const prompts: ContextPackPrompt[] = changes.map((change) => {
    const info = meta.get(change.eventId);
    return {
      eventId: change.eventId,
      ts: info?.ts ?? null,
      session: info?.session ?? null,
      text: info?.text ?? null,
      churn: churn(change.files),
    };
  });

  // Decisions/TODOs from the sessions that shaped this file — the "why" behind
  // it. Scope the extraction to those sessions so dedup stays in-scope: an
  // identical line ("let's use X") in an unrelated session can no longer win the
  // global dedup and suppress this file's own decision.
  const sessions = new Set(prompts.map((p) => p.session).filter((s): s is string => s !== null));
  const knowledge =
    sessions.size > 0 ? await extractKnowledge(chronicleDir, log, { sessions: [...sessions] }) : [];

  const empty = prompts.length === 0;
  const markdown = renderMarkdown(file, prompts, knowledge, empty);
  return { file, prompts, knowledge, markdown, empty };
}

function renderMarkdown(
  file: string,
  prompts: ContextPackPrompt[],
  knowledge: KnowledgeItem[],
  empty: boolean,
): string {
  const lines: string[] = [`# Context for ${file}`, ""];
  if (empty) {
    lines.push(
      "_No captured history shaped this file yet — nothing to brief. Chronicle can only",
      "assemble context for work done while capture was running._",
    );
    return lines.join("\n") + "\n";
  }
  lines.push(
    "_Assembled from your own AI-development history so your next prompt starts with",
    "what was already asked and decided — paste this into your AI tool._",
    "",
    "## What shaped this file",
    "",
  );
  prompts.forEach((p, i) => {
    const text = p.text === null ? "(prompt text unavailable)" : `"${oneLine(p.text)}"`;
    lines.push(`${i + 1}. ${whenOf(p.ts)}  ${p.churn}  — ${text}`);
  });

  if (knowledge.length > 0) {
    lines.push("", "## Decisions & TODOs from these sessions", "");
    for (const k of knowledge) {
      lines.push(`- **[${k.kind}]** ${k.text}  _(${k.role}, ${whenOf(k.ts)})_`);
    }
  }
  lines.push(
    "",
    "---",
    "_Derived from the Chronicle record on this machine. Chronicle never calls a model;",
    "this is your context, assembled — nothing left your machine._",
  );
  return lines.join("\n") + "\n";
}
