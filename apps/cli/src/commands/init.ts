/**
 * `chronicle init` — the product's first impression (J1): consent-first,
 * ≤3 questions, every one skippable, `--yes` for scripts, and silent
 * fallback to defaults when stdin isn't a TTY.
 */
import { createInterface } from "node:readline/promises";
import { runInit, isChronicleError } from "@gigaichronicle/core";
import { EXIT_FAILURE, EXIT_OK, printJson } from "../context.js";

interface InitFlags {
  yes?: boolean;
  name?: string;
  metadataOnly?: boolean;
  privateSessions?: boolean;
  gitTrailer?: boolean;
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

    if (global.json === true) {
      printJson("init", {
        projectId: result.projectId,
        projectName: result.projectName,
        providers: result.providers,
        touched: result.touched,
      });
    } else {
      const detected = Object.entries(result.providers)
        .filter(([, mode]) => mode === "auto")
        .map(([id]) => id);
      console.log(
        [
          `✓ initialized "${result.projectName}" (${result.projectId})`,
          `  touched (the complete footprint): ${result.touched.join(", ")}`,
          detected.length > 0
            ? `  detected tools: ${detected.join(", ")} (live capture + backfill arrive with M7)`
            : "  no AI tools detected yet — capture starts when one appears",
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
