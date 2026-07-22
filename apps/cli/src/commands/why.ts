/**
 * `chronicle why <file>` — why does this code look like this? (ADR-0013)
 *
 * `git blame` says *you* changed the line. This says what was *asked*. The
 * answer is joined from two things that already exist: the checkpoint a
 * capture takes at every prompt (ADR-0012) and the PromptSubmitted text in
 * the index. Nothing new is recorded to answer it.
 */
import path from "node:path";
import { ChronicleIndex, EventLog, changesByPrompt, unifiedDiff } from "@gigaichronicle/core";
import type { ChronicleEvent } from "@gigaichronicle/schema";
import {
  EXIT_NOT_A_PROJECT,
  EXIT_OK,
  EXIT_USAGE,
  findChronicleDir,
  printJson,
  resolveWorkspace,
} from "../context.js";

/**
 * Prompt text as the store has it.
 *
 * Under metadata-only capture this is the `[METADATA-ONLY]` marker — a real
 * string, and honest on its face (ADR-0015). Null means the body was spilled
 * to a blob sidecar past 64KB (§7.2 rule 5), which is a different thing and
 * must not be reported as a privacy mode.
 */
function promptText(event: ChronicleEvent | undefined): string | null {
  if (event === undefined) return null;
  const text = (event.payload as Record<string, unknown>)["text"];
  return typeof text === "string" ? text : null;
}

function truncate(value: string, max: number): string {
  const flat = value.replace(/\s+/gu, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** "+12 −3" for one turn, summed across the files in scope. Binary → "bin". */
function churn(files: { insertions: number | null; deletions: number | null }[]): string {
  if (files.some((f) => f.insertions === null)) return "bin";
  const plus = files.reduce((sum, f) => sum + (f.insertions ?? 0), 0);
  const minus = files.reduce((sum, f) => sum + (f.deletions ?? 0), 0);
  return `+${plus} −${minus}`;
}

/**
 * Resolve the user's path (absolute, or relative to cwd) to a repo-relative
 * git pathspec. Returns null when it points outside the repository.
 */
export function toRepoRelative(repoRoot: string, cwd: string, file: string): string | null {
  const relative = path.relative(repoRoot, path.resolve(cwd, file));
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return relative.split(path.sep).join("/"); // git pathspecs are always POSIX
}

export async function runWhyCommand(
  file: string,
  options: { limit?: string; evolution?: boolean },
  global: { json?: boolean },
): Promise<number> {
  const chronicleDir = findChronicleDir(process.cwd());
  if (chronicleDir === null) {
    console.error("not a chronicle project (no .chronicle directory found)");
    return EXIT_NOT_A_PROJECT;
  }
  const repoRoot = path.dirname(chronicleDir);
  const target = toRepoRelative(repoRoot, process.cwd(), file);
  if (target === null) {
    console.error(`why: "${file}" is outside this repository`);
    return EXIT_USAGE;
  }
  const limit = Number(options.limit ?? 10);
  if (!Number.isInteger(limit) || limit < 1) {
    console.error(`why: --limit must be a positive integer, got "${options.limit}"`);
    return EXIT_USAGE;
  }

  const changes = await changesByPrompt(repoRoot, { path: target, limit });

  const log = await EventLog.open(chronicleDir, {
    workspaceId: await resolveWorkspace(chronicleDir),
    fsyncIntervalMs: 0,
  });
  const index = ChronicleIndex.open(chronicleDir);
  try {
    await index.catchUp(log);
    // All reads come from the index (§8). Prompts are few relative to tool
    // events, so one windowed query joins cheaply against the attributions.
    const prompts = new Map<string, ChronicleEvent>(
      index
        .timeline({ types: ["PromptSubmitted"], limit: 10_000 })
        .map((event) => [event.id, event]),
    );

    const attributed = changes.map((change) => {
      const event = prompts.get(change.eventId);
      return {
        eventId: change.eventId,
        ts: event?.ts ?? null,
        prompt: promptText(event),
        churn: churn(change.files),
        files: change.files,
        openTurn: change.to === null,
      };
    });

    const emptyMessage =
      `no captured prompt is known to have changed ${target}\n` +
      "  why records nothing of its own — it reads the checkpoints capture takes at each\n" +
      "  prompt (ADR-0012), so it can only answer for work done since capture was running.";

    // --evolution: the same attribution, read as a story — each prompt with a
    // plain-text diff against the previous one that shaped this file, so you
    // see the ask sharpening. Prompts with no text (metadata-only, or a >64KB
    // blob body) can't form a diff pair; that is surfaced, never hidden.
    if (options.evolution === true) {
      const steps = attributed.map((item, i) => {
        const prev = i === 0 ? null : (attributed[i - 1] ?? null);
        // Two consecutive prompts can be word-for-word identical ("continue",
        // "fix it"): that is not a change, so no diff is claimed.
        const identical =
          prev !== null && prev.prompt !== null && item.prompt !== null && prev.prompt === item.prompt;
        const diffFromPrev =
          prev !== null && prev.prompt !== null && item.prompt !== null && prev.prompt !== item.prompt
            ? unifiedDiff(prev.prompt, item.prompt, prev.eventId, item.eventId)
            : null;
        return { eventId: item.eventId, ts: item.ts, prompt: item.prompt, churn: item.churn, diffFromPrev, identical };
      });

      if (global.json === true) {
        printJson("why", { file: target, mode: "evolution", count: steps.length, steps });
        return EXIT_OK;
      }
      if (steps.length === 0) {
        console.log(emptyMessage);
        return EXIT_OK;
      }
      console.log(`how the ask for ${target} evolved — ${steps.length} prompt(s):\n`);
      steps.forEach((step, i) => {
        const when = step.ts === null ? "unknown time" : step.ts.replace("T", " ").slice(0, 16);
        const text =
          step.prompt === null
            ? `(prompt body unavailable — chronicle inspect ${step.eventId})`
            : `"${truncate(step.prompt, 68)}"`;
        console.log(`  ${i + 1}. ${when}  ${step.churn.padStart(9)}  ${text}`);
        if (step.identical) {
          console.log("     ── same wording as the previous prompt ──");
        } else if (step.diffFromPrev !== null) {
          console.log("     ── how the ask changed from the previous prompt ──");
          // Drop unifiedDiff's `--- / +++` header (the event ids are already shown above).
          for (const line of step.diffFromPrev.split("\n").slice(2)) console.log(`     ${line}`);
        }
        console.log("");
      });
      return EXIT_OK;
    }

    if (global.json === true) {
      printJson("why", { file: target, count: attributed.length, attributions: attributed });
      return EXIT_OK;
    }

    if (attributed.length === 0) {
      console.log(emptyMessage);
      return EXIT_OK;
    }

    console.log(`why ${target} looks like this — ${attributed.length} prompt(s):\n`);
    for (const item of attributed) {
      const when = item.ts === null ? "unknown time" : item.ts.replace("T", " ").slice(0, 16);
      const text =
        item.prompt === null
          ? `(prompt body over 64KB, stored separately — chronicle inspect ${item.eventId})`
          : `"${truncate(item.prompt, 68)}"`;
      console.log(`  ${when}  ${item.churn.padStart(9)}  ${text}`);
      console.log(`  ${" ".repeat(when.length)}  ${" ".repeat(9)}  ⏪ chronicle restore ${item.eventId}`);
      if (item.openTurn) {
        console.log(`  ${" ".repeat(when.length)}  ${" ".repeat(9)}  · still open (compared against your working tree)`);
      }
      console.log("");
    }
    return EXIT_OK;
  } finally {
    index.close();
    await log.close();
  }
}
