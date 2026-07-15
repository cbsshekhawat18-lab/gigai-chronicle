/**
 * `chronicle init` core (§14, journey J1): mint the project identity,
 * scaffold `.chronicle/`, append the `.gitattributes` PR-noise entries (A3),
 * seed the workspace state, and record `ProjectCreated`. Consent-first: it
 * touches exactly three paths (config.json, .chronicle/.gitignore,
 * .gitattributes) and nothing else — DoD-tested via `git status`.
 */
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  configSchema,
  newId,
  type ChronicleConfig,
  type ProjectId,
} from "@gigaichronicle/schema";
import { ChronicleError } from "../errors.js";
import { EventEngine } from "../engine/event-engine.js";
import { createGitReader } from "../git/git-reader.js";
import { isGitRepository } from "../git/git-info.js";
import { computeRepositoryFingerprint } from "../identity/fingerprint.js";
import { loadOrCreateMachineState, saveMachineState, utcDay } from "../identity/machine.js";
import { detectProviders, type ProviderMode } from "./detect-providers.js";

export interface InitOptions {
  /** Defaults to the repo directory's basename. */
  projectName?: string;
  /** "full" (default) or the high-sensitivity "metadata" mode (decision #3). */
  captureMode?: "full" | "metadata";
  /** Default visibility for new sessions (A2). Default "shared". */
  sessionVisibility?: "shared" | "private";
  /** Record the opt-in trailer choice; hook install lands with M9. */
  gitTrailer?: boolean;
  /** Injectable for tests. */
  detectedProviders?: Record<string, ProviderMode>;
}

export interface InitResult {
  chronicleDir: string;
  projectId: ProjectId;
  projectName: string;
  providers: Record<string, ProviderMode>;
  /** Paths created/modified, workspace-relative — the whole footprint. */
  touched: string[];
}

const GITATTRIBUTES_LINES = [".chronicle/sessions/** linguist-generated=true"];

export async function runInit(workspaceRoot: string, options: InitOptions = {}): Promise<InitResult> {
  const root = path.resolve(workspaceRoot);

  if (!(await isGitRepository(root))) {
    throw new ChronicleError(
      "E_NOT_INITIALIZED",
      "chronicle records the journey alongside git history — run `git init` first",
    );
  }

  const chronicleDir = path.join(root, ".chronicle");
  if (await exists(path.join(chronicleDir, "config.json"))) {
    throw new ChronicleError(
      "E_ALREADY_INITIALIZED",
      "already a chronicle project (.chronicle/config.json exists) — try `chronicle status`",
    );
  }

  const projectId = newId("project");
  const projectName = options.projectName ?? path.basename(root);
  const providers = options.detectedProviders ?? detectProviders();

  const config: ChronicleConfig = configSchema.parse({
    $schema: "https://schemas.chronicle.dev/v1/config.json",
    version: 1,
    project: { id: projectId, name: projectName },
    capture: {
      providers,
      ...(options.captureMode === "metadata" ? { mode: "metadata" as const } : {}),
      redaction: { secrets: true, customPatterns: [] },
      visibility: options.sessionVisibility ?? "shared",
      gitTrailer: options.gitTrailer ?? false,
    },
    storage: { digest: { session: true }, retention: { mode: "keep-all" } },
  });

  // Scaffold — exactly the committed surface plus machine-local seeds.
  await mkdir(chronicleDir, { recursive: true });
  await writeFile(
    path.join(chronicleDir, "config.json"),
    JSON.stringify(config, null, 2) + "\n",
    "utf8",
  );
  await writeFile(path.join(chronicleDir, ".gitignore"), ".cache/\n.local/\n", "utf8");
  const touched = [".chronicle/config.json", ".chronicle/.gitignore"];
  if (await appendGitattributes(root)) touched.push(".gitattributes");

  // Workspace seed: identity + fingerprint + throttle marker (ProjectCreated
  // is the day's project event; a same-day ProjectOpened would be noise).
  const state = await loadOrCreateMachineState(chronicleDir);
  const fingerprint = await computeRepositoryFingerprint(root);
  await saveMachineState(chronicleDir, {
    ...state,
    lastKnownPath: root,
    repository: fingerprint,
    lastProjectOpenedDay: utcDay(),
  });

  // The first event of the journey — a SHARED event by design (§5.3): its
  // ambient stream file is committed and travels with every clone.
  const engine = await EventEngine.open(chronicleDir, {
    workspaceId: state.workspace,
    provider: { id: "chronicle", version: "0" },
    gitReader: createGitReader(root),
    fsyncIntervalMs: 0,
  });
  try {
    const emitted = await engine.emit({
      type: "ProjectCreated",
      actor: { kind: "human" },
      payload: { projectId, name: projectName },
    });
    if (emitted.accepted) {
      const now = new Date();
      const month = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
      touched.push(`.chronicle/sessions/${month}/amb_${state.workspace}.jsonl`);
    }
  } finally {
    await engine.close();
  }

  return { chronicleDir, projectId, projectName, providers, touched };
}

/** Append missing entries; never clobber existing content. True if modified. */
async function appendGitattributes(root: string): Promise<boolean> {
  const file = path.join(root, ".gitattributes");
  let existing = "";
  try {
    existing = await readFile(file, "utf8");
  } catch {
    // absent — will be created
  }
  const present = new Set(existing.split("\n").map((line) => line.trim()));
  const missing = GITATTRIBUTES_LINES.filter((line) => !present.has(line));
  if (missing.length === 0) return false;
  const glue = existing === "" || existing.endsWith("\n") ? "" : "\n";
  await writeFile(file, `${existing}${glue}${missing.join("\n")}\n`, "utf8");
  return true;
}

async function exists(file: string): Promise<boolean> {
  return stat(file).then(
    () => true,
    () => false,
  );
}
