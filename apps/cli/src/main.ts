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
  .command("why <file>")
  .description("what was ASKED that made this file look like this (git blame says who; this says why — ADR-0013)")
  .option("--limit <n>", "max attributed prompts", "10")
  .option("--evolution", "show how the ask changed across the prompts that shaped this file")
  .action(async (file: string, options: { limit?: string; evolution?: boolean }) => {
    const { runWhyCommand } = await import("./commands/why.js");
    process.exitCode = await runWhyCommand(file, options, program.opts<{ json?: boolean }>());
  });

program
  .command("diff [evtA] [evtB]")
  .description("diff two prompts you typed — no args = the last two (the wording delta git can't show)")
  .action(async (evtA: string | undefined, evtB: string | undefined) => {
    const { runDiffCommand } = await import("./commands/diff.js");
    process.exitCode = await runDiffCommand(evtA, evtB, program.opts<{ json?: boolean }>());
  });

program
  .command("knowledge")
  .description("the decisions & TODOs buried in your sessions — surfaced with provenance (model-free)")
  .option("--type <kind>", "filter to decision|todo")
  .option("--session <id>", "only this session")
  .action(async (options: { type?: string; session?: string }) => {
    const { runKnowledgeCommand } = await import("./commands/knowledge.js");
    process.exitCode = await runKnowledgeCommand(options, program.opts<{ json?: boolean }>());
  });

program
  .command("memory <action> [id]")
  .description("Project Memory: list|search|show|verify|rebuild|conflicts|stats (derived, model-free)")
  .option("--type <kind>", "filter by memory kind (decision, todo, known_issue, …)")
  .option("--status <status>", "filter by status (active, superseded, …)")
  .option("--file <path>", "filter to items related to a file path")
  .option("--since <ts>", "only items updated at/after this ISO timestamp")
  .option("--include-local", "include local (private-derived) memory — an owner-only read")
  .action(
    async (
      action: string,
      id: string | undefined,
      options: { type?: string; status?: string; file?: string; since?: string; includeLocal?: boolean },
    ) => {
      const { runMemoryCommand } = await import("./commands/memory.js");
      process.exitCode = await runMemoryCommand(action, id, options, program.opts<{ json?: boolean }>());
    },
  );

program
  .command("context <file>")
  .description("brief your AI tool: the prompts + decisions that shaped a file, as paste-ready Markdown")
  .option("--limit <n>", "max shaping prompts", "8")
  .option("--copy", "also place the brief on the system clipboard")
  .action(async (file: string, options: { limit?: string; copy?: boolean }) => {
    const { runContextCommand } = await import("./commands/context.js");
    process.exitCode = await runContextCommand(file, options, program.opts<{ json?: boolean }>());
  });

const continuityOpts = <T extends import("commander").Command>(cmd: T): T =>
  cmd
    .option("--task <text>", "scope the briefing to a task")
    .option("--file <path>", "scope the briefing to a file")
    .option("--budget <n>", "approximate token budget for the pack")
    .option("--since <ts>", "only memory updated at/after this ISO timestamp")
    .option("--compact", "terser output")
    .option("--full", "fuller output")
    .option("--copy", "also place the output on the system clipboard")
    .option("--include-local", "include local (private-derived) memory — owner-only") as T;

continuityOpts(
  program
    .command("project <action>")
    .description("project context: an AI-ready briefing from Project Memory (action: context)"),
).action(async (action: string, options: Record<string, string | boolean | undefined>) => {
  const { runProjectCommand } = await import("./commands/continuity.js");
  process.exitCode = await runProjectCommand(action, options, program.opts<{ json?: boolean }>());
});

continuityOpts(
  program.command("bootstrap").description("onboard a new AI agent to this project (rules + state + next step)"),
).action(async (options: Record<string, string | boolean | undefined>) => {
  const { runBootstrapCommand } = await import("./commands/continuity.js");
  process.exitCode = await runBootstrapCommand(options, program.opts<{ json?: boolean }>());
});

continuityOpts(
  program.command("continue").description("a ready-to-paste prompt to continue where the last session stopped"),
).action(async (options: Record<string, string | boolean | undefined>) => {
  const { runContinueCommand } = await import("./commands/continuity.js");
  process.exitCode = await runContinueCommand(options, program.opts<{ json?: boolean }>());
});

continuityOpts(
  program
    .command("handoff")
    .description("a development handoff, persisted into memory for the next agent")
    .option("--objective <text>", "state the handoff objective explicitly"),
).action(async (options: Record<string, string | boolean | undefined>) => {
  const { runHandoffCommand } = await import("./commands/continuity.js");
  process.exitCode = await runHandoffCommand(options, program.opts<{ json?: boolean }>());
});

program
  .command("agents <action>")
  .description("write provider-neutral AI instruction files (AGENTS.md/CLAUDE.md/GEMINI.md); action: init")
  .option("--force", "overwrite existing files (default: never clobber user-authored files)")
  .action(async (action: string, options: { force?: boolean }) => {
    const { runAgentsCommand } = await import("./commands/agents.js");
    process.exitCode = await runAgentsCommand(action, options, program.opts<{ json?: boolean }>());
  });

// Development Intelligence — explainable, deterministic insight over history +
// memory + git. Umbrella + signature top-level commands (the docs feature both).
const INTEL_CORE = new Set(["risk", "why-not", "repeat", "impact", "scope", "preflight", "postflight"]);
const intel = async (action: string, target: string | undefined, options: { file?: string; task?: string; since?: string }): Promise<void> => {
  const g = program.opts<{ json?: boolean }>();
  if (INTEL_CORE.has(action)) {
    const { runIntelligenceCommand } = await import("./commands/intelligence.js");
    process.exitCode = await runIntelligenceCommand(action, target, options, g);
  } else {
    const { runInsightsCommand } = await import("./commands/insights.js");
    process.exitCode = await runInsightsCommand(action, target, options, g);
  }
};

program
  .command("intelligence <action> [target]")
  .description("development intelligence: risk|why-not|repeat (explainable, model-free)")
  .option("--file <path>", "repeat: filter to a file")
  .option("--task <text>", "repeat: filter to a task")
  .option("--since <ts>", "repeat: only occurrences at/after this ISO timestamp")
  .action((action: string, target: string | undefined, options: { file?: string; task?: string; since?: string }) => intel(action, target, options));

program
  .command("risk [file]")
  .description("explainable risk score for a file (previous failures, active decisions, churn…)")
  .action((file: string | undefined) => intel("risk", file, {}));

program
  .command("why-not <file>")
  .description("negative knowledge: what should NOT change here, and why (decisions, failed approaches)")
  .action((file: string) => intel("why-not", file, {}));

program
  .command("repeat")
  .description("repeated problems detected across sessions (review before trying again)")
  .option("--file <path>", "filter to a file")
  .option("--task <text>", "filter to a task")
  .option("--since <ts>", "only occurrences at/after this ISO timestamp")
  .action((options: { file?: string; task?: string; since?: string }) => intel("repeat", undefined, options));

program
  .command("impact <file>")
  .description("change impact radar: files that historically change with this one + its dependencies")
  .action((file: string) => intel("impact", file, {}));

program
  .command("preflight <task>")
  .description("before you code: decisions, previous attempts, contradictions, risk, tests, verdict")
  .action((task: string) => intel("preflight", task, {}));

program
  .command("postflight")
  .description("after you code: changed files, scope drift, new decisions/TODOs, status")
  .action(() => intel("postflight", undefined, {}));

program
  .command("scope")
  .description("scope drift: did the latest session change areas beyond its stated task?")
  .action(() => intel("scope", undefined, {}));

// Development-intelligence reports (each also reachable via `chronicle intelligence <action>`).
program.command("drift").description("decision drift: active decisions the code may have outgrown").action(() => intel("drift", undefined, {}));
program.command("decisions").description("decision health: age, drift, and conflicts across active decisions").action(() => intel("decision-health", undefined, {}));
program.command("unfinished").description("work that looks started but not completed (confidence-labeled)").action(() => intel("unfinished", undefined, {}));
program.command("stuck").description("tasks that appear stalled — repeated across sessions with no resolution").action(() => intel("stuck", undefined, {}));
program.command("debt").description("technical debt discovered through development (with provenance)").action(() => intel("debt", undefined, {}));
program.command("learnings").description("lessons derived from history — rejected/superseded approaches, resolved issues").action(() => intel("learnings", undefined, {}));
program.command("thinking <task>").description("how your thinking on a task evolved (decisions, rejections, direction)").action((task: string) => intel("thinking", task, {}));
program.command("story").description("a development narrative from your history").option("--since <ts>", "only since this ISO timestamp").action((options: { since?: string }) => intel("story", undefined, options));
program.command("heatmap").description("where development activity concentrates (prompts + churn + repeated fixes)").action(() => intel("heatmap", undefined, {}));
program.command("graph [file]").description("work graph connecting files, decisions, and issues").option("--task <text>", "scope to a task").action((file: string | undefined, options: { task?: string }) => intel("graph", file, options));
program.command("health").description("overall project development health (explainable sub-metrics)").action(() => intel("health", undefined, {}));
program.command("dna").description("this repository's development profile (derived from evidence)").action(() => intel("dna", undefined, {}));
program.command("memory-health").description("is the project understandable to a new AI? (coverage + recommendations)").action(() => intel("memory-health", undefined, {}));
program.command("onboarding-test").description("simulate a new AI entering the repo — readiness score + gaps").action(() => intel("onboarding-test", undefined, {}));

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
  .description("prompt version control: save|list|show|versions|diff|use|compare|revert (§5.4)")
  .option("--title <title>", "prompt title")
  .option("--tags <tags>", "comma-separated tags")
  .option("--text <text>", "prompt body inline")
  .option("--from-file <path>", "prompt body from a file")
  .option("--from-last", "promote the last prompt you typed — no retyping (ADR-0014)")
  .option("--from-event <evt>", "promote a captured prompt by event id")
  .option("--from-session <ses>", "promote the last prompt of a session")
  .option("--session <id>", "provenance: the session this prompt came from")
  .option("--note <text>", "why this version exists — the library's commit message")
  .option("--copy", "use: also place the prompt on the system clipboard")
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
