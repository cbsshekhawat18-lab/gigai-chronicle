/**
 * `chronicle diff [evtA] [evtB]` — the unified diff between two prompts you
 * TYPED (not two library versions — that's `chronicle prompt diff`).
 *
 * The ask nobody else answers (launch feedback): "I rewrote the prompt three
 * times before it worked — what actually changed between attempts?" With no
 * arguments it diffs the last two captured prompts, so the common case ("I
 * just rephrased — show me the delta") is a single word. Reuses the same
 * plain-text `unifiedDiff` the prompt library uses; nothing new is recorded.
 */
import {
  EventLog,
  capturedPromptByEvent,
  capturedPrompts,
  unifiedDiff,
  type CapturedPrompt,
} from "@gigaichronicle/core";
import {
  EXIT_FAILURE,
  EXIT_NOT_A_PROJECT,
  EXIT_OK,
  EXIT_USAGE,
  findChronicleDir,
  printJson,
  resolveWorkspace,
} from "../context.js";

function when(prompt: CapturedPrompt): string {
  return prompt.ts.replace("T", " ").slice(0, 16);
}

function oneLine(text: string, max = 68): string {
  const flat = text.replace(/\s+/gu, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export async function runDiffCommand(
  a: string | undefined,
  b: string | undefined,
  global: { json?: boolean },
): Promise<number> {
  const chronicleDir = findChronicleDir(process.cwd());
  if (chronicleDir === null) {
    console.error("not a chronicle project (no .chronicle directory found)");
    return EXIT_NOT_A_PROJECT;
  }
  // Exactly zero or exactly two event ids — one is ambiguous ("against what?").
  if ((a === undefined) !== (b === undefined)) {
    console.error(
      "usage: chronicle diff [<evtA> <evtB>]\n" +
        "  with no arguments, diffs the last two prompts you typed",
    );
    return EXIT_USAGE;
  }

  const log = await EventLog.open(chronicleDir, {
    workspaceId: await resolveWorkspace(chronicleDir),
    fsyncIntervalMs: 0,
  });
  try {
    let left: CapturedPrompt | null;
    let right: CapturedPrompt | null;
    if (a !== undefined && b !== undefined) {
      [left, right] = await Promise.all([
        capturedPromptByEvent(chronicleDir, log, a),
        capturedPromptByEvent(chronicleDir, log, b),
      ]);
      if (left === null) {
        console.error(`diff: no captured prompt text for ${a} (unknown event, or metadata-only capture)`);
        return EXIT_FAILURE;
      }
      if (right === null) {
        console.error(`diff: no captured prompt text for ${b} (unknown event, or metadata-only capture)`);
        return EXIT_FAILURE;
      }
    } else {
      // Default: the last two prompts, oldest of the pair on the left so the
      // diff reads "how the newer one changed".
      const all = await capturedPrompts(chronicleDir, log);
      if (all.length < 2) {
        console.error(
          "diff: need two captured prompts to compare — only " +
            `${all.length} found so far. Type another prompt, or pass two event ids.`,
        );
        return EXIT_FAILURE;
      }
      left = all[all.length - 2] as CapturedPrompt;
      right = all[all.length - 1] as CapturedPrompt;
    }

    const diff = unifiedDiff(left.text, right.text, `${left.eventId}  (${when(left)})`, `${right.eventId}  (${when(right)})`);

    if (global.json === true) {
      printJson("diff", {
        a: { eventId: left.eventId, ts: left.ts },
        b: { eventId: right.eventId, ts: right.ts },
        diff,
      });
      return EXIT_OK;
    }

    console.log(`how the prompt changed — ${left.eventId} → ${right.eventId}:\n`);
    console.log(`  A  ${when(left)}  "${oneLine(left.text)}"`);
    console.log(`  B  ${when(right)}  "${oneLine(right.text)}"`);
    console.log("");
    console.log(diff);
    return EXIT_OK;
  } finally {
    await log.close();
  }
}
