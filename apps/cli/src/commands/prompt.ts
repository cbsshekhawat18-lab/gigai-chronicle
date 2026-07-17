/**
 * `chronicle prompt` — version control for prompts (§5.4, ADR-0011).
 * save/list/show/versions/diff over curated Markdown in .chronicle/prompts/.
 */
import { readFileSync } from "node:fs";
import {
  EventLog,
  capturedPromptByEvent,
  getPrompt,
  isChronicleError,
  lastCapturedPrompt,
  listPrompts,
  promptVersions,
  savePrompt,
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

export interface PromptFlags {
  title?: string;
  tags?: string;
  text?: string;
  fromFile?: string;
  session?: string;
  fromEvent?: string;
  fromSession?: string;
  fromLast?: boolean;
}

/**
 * Resolve `--from-event | --from-session | --from-last` to the captured
 * prompt they name (ADR-0014). Null when no --from-* flag was passed.
 */
async function resolveCaptured(
  chronicleDir: string,
  flags: PromptFlags,
): Promise<CapturedPrompt | null | "none"> {
  const wants =
    flags.fromEvent !== undefined || flags.fromSession !== undefined || flags.fromLast === true;
  if (!wants) return "none";

  const log = await EventLog.open(chronicleDir, {
    workspaceId: await resolveWorkspace(chronicleDir),
    fsyncIntervalMs: 0,
  });
  try {
    if (flags.fromEvent !== undefined) {
      return await capturedPromptByEvent(chronicleDir, log, flags.fromEvent);
    }
    return await lastCapturedPrompt(
      chronicleDir,
      log,
      flags.fromSession !== undefined ? { session: flags.fromSession } : {},
    );
  } finally {
    await log.close();
  }
}

export async function runPromptCommand(
  action: string,
  slug: string | undefined,
  rest: string[],
  flags: PromptFlags,
  global: { json?: boolean },
): Promise<number> {
  const chronicleDir = findChronicleDir(process.cwd());
  if (chronicleDir === null) {
    console.error("not a chronicle project (no .chronicle directory found)");
    return EXIT_NOT_A_PROJECT;
  }

  try {
    switch (action) {
      case "save": {
        if (slug === undefined) {
          console.error(
            "usage: chronicle prompt save <slug> [--text …|--from-file …|--from-last|--from-event evt_…|--from-session ses_…]",
          );
          return EXIT_USAGE;
        }
        // A prompt you already typed can be promoted as-is — no retyping (ADR-0014).
        const captured = await resolveCaptured(chronicleDir, flags);
        if (captured === null) {
          console.error(
            flags.fromEvent !== undefined
              ? `prompt save: no captured prompt text for ${flags.fromEvent} (unknown event, or metadata-only capture)`
              : "prompt save: no captured prompt found to promote — type one first, or pass --text",
          );
          return EXIT_FAILURE;
        }
        const promoted = captured === "none" ? null : captured;
        const body =
          promoted?.text ??
          flags.text ??
          (flags.fromFile !== undefined ? readFileSync(flags.fromFile, "utf8") : undefined);
        const saved = await savePrompt(chronicleDir, {
          slug,
          ...(body !== undefined ? { body } : {}),
          ...(flags.title !== undefined ? { title: flags.title } : {}),
          ...(flags.tags !== undefined
            ? { tags: flags.tags.split(",").map((t) => t.trim()).filter((t) => t !== "") }
            : {}),
          // Explicit --session wins; otherwise a promoted prompt carries its
          // own provenance for free.
          ...(flags.session !== undefined
            ? { sourceSession: flags.session }
            : promoted?.session != null
              ? { sourceSession: promoted.session }
              : {}),
        });
        if (global.json === true) {
          printJson("prompt", {
            action,
            prompt: saved,
            ...(promoted !== null ? { promotedFrom: promoted.eventId } : {}),
          });
        } else {
          console.log(
            `✓ ${saved.slug} v${saved.version} saved (.chronicle/prompts/${saved.slug}/) — commit it and the team gets it`,
          );
          if (promoted !== null) {
            console.log(`  promoted from ${promoted.eventId} — the prompt you typed, not retyped`);
          }
        }
        return EXIT_OK;
      }
      case "list": {
        const prompts = await listPrompts(chronicleDir);
        if (global.json === true) printJson("prompt", { action, count: prompts.length, prompts });
        else if (prompts.length === 0)
          console.log('no prompts yet — chronicle prompt save <slug> --text "…"');
        else
          for (const p of prompts) {
            console.log(
              `${p.slug}  v${p.version}${p.tags.length > 0 ? `  [${p.tags.join(", ")}]` : ""}\n  ${p.title}`,
            );
          }
        return EXIT_OK;
      }
      case "show": {
        if (slug === undefined) return usage("show <slug> [version]");
        const version = rest[0] !== undefined ? Number(rest[0]) : undefined;
        const prompt = await getPrompt(chronicleDir, slug, version);
        if (global.json === true) printJson("prompt", { action, prompt });
        else console.log(`# ${prompt.title} (v${prompt.version})\n\n${prompt.body}`);
        return EXIT_OK;
      }
      case "versions": {
        if (slug === undefined) return usage("versions <slug>");
        const versions = await promptVersions(chronicleDir, slug);
        if (global.json === true) printJson("prompt", { action, slug, versions });
        else console.log(versions.map((v) => `v${v}`).join("\n"));
        return EXIT_OK;
      }
      case "diff": {
        const [a, b] = [rest[0], rest[1]];
        if (slug === undefined || a === undefined || b === undefined) {
          return usage("diff <slug> <versionA> <versionB>");
        }
        const [pa, pb] = await Promise.all([
          getPrompt(chronicleDir, slug, Number(a)),
          getPrompt(chronicleDir, slug, Number(b)),
        ]);
        const diff = unifiedDiff(pa.body, pb.body, `${slug} v${a}`, `${slug} v${b}`);
        if (global.json === true) printJson("prompt", { action, slug, a: Number(a), b: Number(b), diff });
        else console.log(diff);
        return EXIT_OK;
      }
      default:
        return usage("save|list|show|versions|diff");
    }
  } catch (error) {
    if (isChronicleError(error)) {
      console.error(error.message);
      return EXIT_FAILURE;
    }
    throw error;
  }
}

function usage(hint: string): number {
  console.error(`usage: chronicle prompt ${hint}`);
  return EXIT_USAGE;
}
