/**
 * chronicle — AI development history, in your repo, replayable.
 * (M4 skeleton: doctor · timeline · status. Capture arrives with M6/M7;
 * replay with M8.)
 */
import { Command, CommanderError } from "commander";
import { EXIT_FAILURE, EXIT_USAGE } from "./context.js";

// Subcommand implementations are dynamically imported (§14): --version/help
// never pay for core, zod, or sqlite. esbuild code-splitting keeps each in
// its own chunk.

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
      const { runInitCommand } = await import("./commands/init.js");
      process.exitCode = await runInitCommand(options, program.opts<{ json?: boolean }>());
    },
  );

program
  .command("doctor")
  .description("verify log integrity, index freshness, and the zero-egress configuration")
  .option("--reindex", "rebuild the SQLite index from the event log")
  .option("--scan-secrets", "audit stored events against the secret pattern pack")
  .action(async (options: { reindex?: boolean; scanSecrets?: boolean }) => {
    const { runDoctorCommand } = await import("./commands/doctor.js");
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
  .option("--provider <id>", "filter by capturing provider (e.g. claude-code)")
  .option("--model <name>", "filter by the model that answered")
  .option("--limit <n>", "max events", "100")
  .option("--from-start", "oldest-first from the beginning (default shows the latest window)")
  .action(async (options: Record<string, string | string[] | boolean | undefined>) => {
    const { runTimelineCommand } = await import("./commands/timeline.js");
    process.exitCode = await runTimelineCommand(options, program.opts<{ json?: boolean }>());
  });

program
  .command("sessions")
  .description("session history with provider/model badges — which AI did the work")
  .option("--provider <id>", "only sessions where this provider captured (e.g. claude-code)")
  .option("--model <name>", "only sessions where this model answered")
  .action(async (options: { provider?: string; model?: string }) => {
    const { runSessionsCommand } = await import("./commands/sessions.js");
    process.exitCode = await runSessionsCommand(options, program.opts<{ json?: boolean }>());
  });

program
  .command("status")
  .description("store, capture, and index health at a glance")
  .action(async () => {
    const { runStatusCommand } = await import("./commands/status.js");
    process.exitCode = await runStatusCommand(program.opts<{ json?: boolean }>());
  });

program
  .command("replay <session>")
  .description("step through a session — conversation, tools, files, commits interleaved")
  .option("--at <eventId>", "stop at (or return the frame of) this event")
  .action(async (target: string, options: { at?: string }) => {
    const { runReplayCommand } = await import("./commands/replay.js");
    process.exitCode = await runReplayCommand(target, options, program.opts<{ json?: boolean }>());
  });

program
  .command("inspect <target>")
  .description("deep-dive one session, event, or commit — the `git show` of chronicle")
  .action(async (target: string) => {
    const { runInspectCommand } = await import("./commands/inspect.js");
    process.exitCode = await runInspectCommand(target, program.opts<{ json?: boolean }>());
  });

program
  .command("log <message>")
  .description("tier-4 manual capture — the universal floor (one manual session per day)")
  .action(async (message: string) => {
    const { runLogCommand } = await import("./commands/log.js");
    process.exitCode = await runLogCommand(message, program.opts<{ json?: boolean }>());
  });

program
  .command("session <action> <id>")
  .description("promote|privatize a session (social-privacy model: .local/private/)")
  .action(async (action: string, id: string) => {
    const { runSessionCommand } = await import("./commands/session.js");
    process.exitCode = await runSessionCommand(action, id, program.opts<{ json?: boolean }>());
  });

program
  .command("link <action> <sha> <session>")
  .description("confirm|reject a commit↔session link (human judgment beats heuristics, forever)")
  .action(async (action: string, sha: string, session: string) => {
    const { runLinkCommand } = await import("./commands/link.js");
    process.exitCode = await runLinkCommand(action, sha, session, program.opts<{ json?: boolean }>());
  });

program
  .command("restore <eventId>")
  .description("⏪ put your code back to how it was at a captured prompt (safety-checkpointed, ADR-0012)")
  .option("--force", "skip the confirmation (scripts)")
  .action(async (eventId: string, options: { force?: boolean }) => {
    const { runRestoreCommand } = await import("./commands/restore.js");
    process.exitCode = await runRestoreCommand(eventId, options, program.opts<{ json?: boolean }>());
  });

program
  .command("prompt <action> [slug] [args...]")
  .description("prompt version control: save|list|show|versions|diff (§5.4)")
  .option("--title <title>", "prompt title")
  .option("--tags <tags>", "comma-separated tags")
  .option("--text <text>", "prompt body inline")
  .option("--from-file <path>", "prompt body from a file")
  .option("--session <id>", "provenance: the session this prompt came from")
  .action(async (action: string, slug: string | undefined, args: string[], flags: Record<string, string | undefined>) => {
    const { runPromptCommand } = await import("./commands/prompt.js");
    process.exitCode = await runPromptCommand(action, slug, args, flags, program.opts<{ json?: boolean }>());
  });

program
  .command("capture <provider>")
  .description("hook ingestion path (installed hooks call this; exit 0 always)")
  .requiredOption("--event <name>", "hook event name")
  .action(async (providerId: string, options: { event: string }) => {
    const { runCaptureCommand } = await import("./commands/capture.js");
    process.exitCode = await runCaptureCommand(providerId, options.event);
  });

program
  .command("import <provider>")
  .description("backfill history from a tool's existing transcripts (idempotent)")
  .option("--from <dir>", "transcripts root override (e.g. an exported archive)")
  .action(async (providerId: string, options: { from?: string }) => {
    const { runImportCommand } = await import("./commands/import.js");
    process.exitCode = await runImportCommand(providerId, options, program.opts<{ json?: boolean }>());
  });

program
  .command("hooks <action> <provider>")
  .description("install|uninstall capture hooks (project scope by default; merge, never clobber)")
  .option("--user", "user-scope settings instead of the project's .claude/settings.json")
  .action(async (action: string, providerId: string, options: { user?: boolean }) => {
    const { runHooksCommand } = await import("./commands/hooks.js");
    process.exitCode = await runHooksCommand(action, providerId, options, program.opts<{ json?: boolean }>());
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
