/**
 * `chronicle init` — the product's first impression (J1): consent-first,
 * ≤3 questions, every one skippable, `--yes` for scripts, and silent
 * fallback to defaults when stdin isn't a TTY.
 */
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { runInit, isChronicleError, type InitResult } from "@gigaichronicle/core";
import type { WireCaptureResult } from "@gigaichronicle/provider-claude-code";
import { EXIT_FAILURE, EXIT_OK, printJson } from "../context.js";

interface InitFlags {
  yes?: boolean;
  name?: string;
  metadataOnly?: boolean;
  privateSessions?: boolean;
  gitTrailer?: boolean;
  /** commander's `--no-hooks` arrives as false; undefined means "install". */
  hooks?: boolean;
}

/** Where capture ended up wired (or why it didn't). */
type HookOutcome = WireCaptureResult;

const NO_HOOKS: HookOutcome = { file: null, live: false, changed: false, scope: null };

/**
 * Wire live capture as part of init — the app layer's job, so `runInit`
 * (core) stays provider-agnostic. Without this a project is "initialized"
 * yet records NOTHING until a second command nobody runs, and `status` still
 * reports `claude-code:auto` — the silent no-capture trap this fixes.
 */
async function installCaptureHooks(result: InitResult): Promise<HookOutcome> {
  if (result.providers["claude-code"] !== "auto") return NO_HOOKS;
  try {
    const { wireCapture } = await import("@gigaichronicle/provider-claude-code");
    return wireCapture(path.dirname(result.chronicleDir));
  } catch {
    return NO_HOOKS; // unwritable .claude/ — init still succeeded; status says capture is off
  }
}

/** The one line that tells you whether Chronicle is actually recording. */
function captureLine(hooks: HookOutcome, flags: InitFlags): string {
  if (hooks.live && hooks.scope === "user") {
    return "  capture: LIVE — your user-scope hooks already cover this repo";
  }
  if (hooks.live) {
    return `  capture: LIVE — hooks in ${hooks.file} (commit it and the whole team gets capture)`;
  }
  if (flags.hooks === false) {
    return "  capture: OFF (--no-hooks) — start it with `chronicle hooks install claude-code`";
  }
  return "  capture: OFF — start it with `chronicle hooks install claude-code`";
}

interface InterviewAnswers {
  captureMode: "full" | "metadata";
  sessionVisibility: "shared" | "private";
  gitTrailer: boolean;
}

async function interview(flags: InitFlags): Promise<InterviewAnswers> {
  const defaults: InterviewAnswers = {
    captureMode: flags.metadataOnly === true ? "metadata" : "full",
    sessionVisibility: flags.privateSessions === true ? "private" : "shared",
    gitTrailer: flags.gitTrailer === true,
  };
  if (flags.yes === true || !process.stdin.isTTY) return defaults;

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const mode = (
      await rl.question("Capture mode — full (redacted content) or metadata-only? [full] ")
    ).trim();
    const visibility = (
      await rl.question("New sessions start shared or private? [shared] ")
    ).trim();
    const trailer = (
      await rl.question("Stamp commits with a Chronicle-Session trailer (installs with M9)? [y/N] ")
    ).trim();
    return {
      captureMode: mode.toLowerCase().startsWith("m") ? "metadata" : defaults.captureMode,
      sessionVisibility: visibility.toLowerCase().startsWith("p")
        ? "private"
        : defaults.sessionVisibility,
      gitTrailer: trailer.toLowerCase().startsWith("y") ? true : defaults.gitTrailer,
    };
  } finally {
    rl.close();
  }
}

export async function runInitCommand(
  flags: InitFlags,
  global: { json?: boolean },
): Promise<number> {
  try {
    const answers = await interview(flags);
    const result = await runInit(process.cwd(), {
      ...(flags.name !== undefined ? { projectName: flags.name } : {}),
      captureMode: answers.captureMode,
      sessionVisibility: answers.sessionVisibility,
      gitTrailer: answers.gitTrailer,
    });

    const hooks = flags.hooks === false ? NO_HOOKS : await installCaptureHooks(result);
    const touched = [...result.touched, ...(hooks.changed ? [hooks.file as string] : [])];

    if (global.json === true) {
      printJson("init", {
        projectId: result.projectId,
        projectName: result.projectName,
        providers: result.providers,
        touched,
        capture: { live: hooks.live, hooks: hooks.file, scope: hooks.scope },
      });
    } else {
      const detected = Object.entries(result.providers)
        .filter(([, mode]) => mode === "auto")
        .map(([id]) => id);
      console.log(
        [
          `✓ initialized "${result.projectName}" (${result.projectId})`,
          `  touched (the complete footprint): ${touched.join(", ")}`,
          detected.length > 0
            ? `  detected tools: ${detected.join(", ")}`
            : "  no AI tools detected yet — capture starts when one appears",
          captureLine(hooks, flags),
          answers.gitTrailer
            ? "  trailer: enabled in config; the commit hook installs with correlation (M9)"
            : "",
          "  next: keep working — then `chronicle status`",
        ]
          .filter((line) => line !== "")
          .join("\n"),
      );
    }
    return EXIT_OK;
  } catch (error) {
    if (isChronicleError(error)) {
      console.error(error.message);
      return EXIT_FAILURE;
    }
    throw error;
  }
}
