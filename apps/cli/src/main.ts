/**
 * chronicle — AI development history, in your repo, replayable.
 * (M4 skeleton: doctor · timeline · status. Capture arrives with M6/M7;
 * replay with M8.)
 */
import { Command, CommanderError } from "commander";
import { runInitCommand } from "./commands/init.js";
import { runDoctorCommand } from "./commands/doctor.js";
import { runTimelineCommand } from "./commands/timeline.js";
import { runStatusCommand } from "./commands/status.js";
import { EXIT_FAILURE, EXIT_USAGE } from "./context.js";

declare const __CLI_VERSION__: string;

const program = new Command();

program
  .name("chronicle")
  .description("Your AI development history — recorded in-repo, linked to git, replayable.")
  .version(typeof __CLI_VERSION__ === "string" ? __CLI_VERSION__ : "0.0.0")
  .option("--json", "machine-readable output (stable, versioned)")
  .exitOverride();

program
  .command("init")
  .description("initialize this repository as a chronicle project (J1: consent-first, ≤3 questions)")
  .option("-y, --yes", "accept all defaults, no questions")
  .option("--name <name>", "project name (default: repo directory name)")
  .option("--metadata-only", "high-sensitivity mode: event shapes/timings, no prompt text")
  .option("--private-sessions", "new sessions start private (promote deliberately)")
  .option("--git-trailer", "record the opt-in Chronicle-Session trailer choice (hook installs with M9)")
  .action(
    async (options: {
      yes?: boolean;
      name?: string;
      metadataOnly?: boolean;
      privateSessions?: boolean;
      gitTrailer?: boolean;
    }) => {
      process.exitCode = await runInitCommand(options, program.opts<{ json?: boolean }>());
    },
  );

program
  .command("doctor")
  .description("verify log integrity, index freshness, and the zero-egress configuration")
  .option("--reindex", "rebuild the SQLite index from the event log")
  .option("--scan-secrets", "audit stored events against the secret pattern pack")
  .action(async (options: { reindex?: boolean; scanSecrets?: boolean }) => {
    process.exitCode = await runDoctorCommand(options, program.opts<{ json?: boolean }>());
  });

program
  .command("timeline")
  .description("list the journey (the extension's timeline is this query with pixels)")
  .option("--since <ts>", "inclusive ISO lower bound")
  .option("--until <ts>", "inclusive ISO upper bound")
  .option("--branch <name>", "filter by branch at event time")
  .option("--session <id>", "filter by session")
  .option("--type <types...>", "filter by event type(s)")
  .option("--limit <n>", "max events", "100")
  .action(async (options: Record<string, string | string[] | undefined>) => {
    process.exitCode = await runTimelineCommand(options, program.opts<{ json?: boolean }>());
  });

program
  .command("status")
  .description("store, capture, and index health at a glance")
  .action(async () => {
    process.exitCode = await runStatusCommand(program.opts<{ json?: boolean }>());
  });

try {
  await program.parseAsync();
} catch (error) {
  if (error instanceof CommanderError) {
    // help/version exits are code 0; genuine usage errors map to 2 (§14).
    process.exitCode = error.exitCode === 0 ? 0 : EXIT_USAGE;
  } else {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = EXIT_FAILURE;
  }
}
