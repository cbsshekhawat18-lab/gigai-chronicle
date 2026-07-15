/**
 * openWorkspace — every surface's first call when touching a store (§6).
 *
 * Resolves the workspace identity and performs the identity-continuity
 * duties: detect a moved/renamed folder (`WorkspaceMoved`, local), record
 * the throttled `ProjectOpened` (≤1/day/workspace, local), refresh the
 * repository fingerprint, and flag a foreign repository (project id present
 * but disjoint root history — ADR-0009). Never throws for identity
 * anomalies; it reports them (design law 8: honesty over failure).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { configSchema, type ProjectId, type WorkspaceId } from "@gigaichronicle/schema";
import { EventEngine } from "../engine/event-engine.js";
import { fixedGitReader } from "../git/git-reader.js";
import { computeRepositoryFingerprint, isForeignRepository } from "./fingerprint.js";
import { loadOrCreateMachineState, saveMachineState, utcDay } from "./machine.js";

export interface WorkspaceContext {
  workspaceId: WorkspaceId;
  projectId: ProjectId | null;
  projectName: string | null;
  /** Set when this open detected a folder move/rename. */
  moved: { fromPath: string; toPath: string } | null;
  /** Project id present but the repo's root history is disjoint (E_FOREIGN_REPO). */
  foreignRepo: boolean;
  /** Fingerprint recorded without roots (shallow clone) — doctor note. */
  shallow: boolean;
}

/** Identity provider stamped on events this module authors. */
const IDENTITY_PROVIDER = { id: "chronicle", version: "0" };

export async function openWorkspace(chronicleDir: string): Promise<WorkspaceContext> {
  const workspaceRoot = path.dirname(path.resolve(chronicleDir));
  const state = await loadOrCreateMachineState(chronicleDir);

  const config = await readConfig(chronicleDir);
  const projectId = config?.project.id ?? null;
  const projectName = config?.project.name ?? null;

  // Fingerprint + foreign check (roots comparison — ADR-0009).
  const fingerprint = await computeRepositoryFingerprint(workspaceRoot);
  const foreignRepo =
    projectId !== null &&
    isForeignRepository(state.repository?.roots ?? [], fingerprint.roots);

  // Path continuity.
  const moved =
    state.lastKnownPath !== undefined && state.lastKnownPath !== workspaceRoot
      ? { fromPath: state.lastKnownPath, toPath: workspaceRoot }
      : null;

  // Throttled open marker.
  const today = utcDay();
  const recordOpen = state.lastProjectOpenedDay !== today;

  if (moved !== null || recordOpen) {
    const engine = await EventEngine.open(chronicleDir, {
      workspaceId: state.workspace,
      provider: IDENTITY_PROVIDER,
      // Identity events carry no repo-state claims; snapshot cost not worth it.
      gitReader: fixedGitReader(),
      fsyncIntervalMs: 0,
    });
    try {
      if (moved !== null) {
        await engine.emit({ type: "WorkspaceMoved", actor: { kind: "system" }, payload: moved });
      }
      if (recordOpen) {
        await engine.emit({ type: "ProjectOpened", actor: { kind: "system" }, payload: {} });
      }
    } finally {
      await engine.close();
    }
  }

  await saveMachineState(chronicleDir, {
    ...state,
    lastKnownPath: workspaceRoot,
    repository: {
      // Keep known roots when the current view is shallow — the recorded
      // anchor is more informative than an empty set.
      roots: fingerprint.roots.length > 0 ? fingerprint.roots : (state.repository?.roots ?? []),
      remotes: fingerprint.remotes,
      digest: fingerprint.digest,
      shallow: fingerprint.shallow,
    },
    ...(recordOpen ? { lastProjectOpenedDay: today } : {}),
  });

  return {
    workspaceId: state.workspace,
    projectId: projectId as ProjectId | null,
    projectName,
    moved,
    foreignRepo,
    shallow: fingerprint.shallow,
  };
}

async function readConfig(
  chronicleDir: string,
): Promise<{ project: { id: string; name: string } } | null> {
  try {
    const raw = JSON.parse(await readFile(path.join(chronicleDir, "config.json"), "utf8"));
    const parsed = configSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
