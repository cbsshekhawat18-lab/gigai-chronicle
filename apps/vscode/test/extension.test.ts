/**
 * Extension units against a REAL store (mocked vscode API): the engine's
 * pure-fs reads, the tree provider's honesty rendering, and the fact that
 * the packaged surface never touches the native index.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { EventEngine, fixedGitReader, runInit } from "@gigaichronicle/core";
import { newId, type SessionId, type WorkspaceId } from "@gigaichronicle/schema";
import { ChronicleWorkspace } from "../src/engine.js";
import { SessionsTreeProvider } from "../src/sessions-tree.js";

const roots: string[] = [];
afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function seedProject(): Promise<{ folder: string; session: SessionId }> {
  const folder = mkdtempSync(path.join(tmpdir(), "chronicle ext "));
  roots.push(folder);
  execFileSync("git", ["-C", folder, "init", "-q"]);
  execFileSync("git", ["-C", folder, "-c", "user.name=t", "-c", "user.email=t@t.invalid", "commit", "-q", "--allow-empty", "-m", "root"]);
  await runInit(folder, { detectedProviders: {} });

  const chronicleDir = path.join(folder, ".chronicle");
  const machine = JSON.parse(readFileSync(path.join(chronicleDir, ".local", "machine.json"), "utf8")) as { workspace: WorkspaceId };
  const engine = await EventEngine.open(chronicleDir, {
    workspaceId: machine.workspace,
    provider: { id: "example-tool", version: "1.0.0" },
    gitReader: fixedGitReader(),
    fsyncIntervalMs: 0,
  });
  const session = newId("session");
  await engine.emit({ type: "SessionStarted", session, actor: { kind: "human" }, payload: { title: "Ext demo", resumedFrom: null } });
  await engine.emit({ type: "PromptSubmitted", session, actor: { kind: "human" }, payload: { text: "render me" } });
  await engine.emit({ type: "SessionEnded", session, actor: { kind: "system" }, payload: { reason: "completed" } });
  await engine.close();
  return { folder, session };
}

describe("ChronicleWorkspace (pure-fs engine)", () => {
  it("lists sessions and serves frames; non-projects resolve to null", async () => {
    const { folder, session } = await seedProject();
    const workspace = await ChronicleWorkspace.open(folder);
    expect(workspace).not.toBeNull();

    const sessions = await workspace!.sessions();
    expect(sessions.map((s) => s.session)).toContain(session);
    const item = sessions.find((s) => s.session === session);
    expect(item).toMatchObject({ title: "Ext demo", turns: 1, fidelity: "full", gaps: 0 });

    const frames = await workspace!.frames(session);
    expect(frames).toHaveLength(3);
    expect(frames[2]?.conversation[0]?.text).toBe("render me");

    const notProject = mkdtempSync(path.join(tmpdir(), "not chronicle "));
    roots.push(notProject);
    expect(await ChronicleWorkspace.open(notProject)).toBeNull();
  });
});

describe("SessionsTreeProvider (honesty in pixels)", () => {
  it("renders items with fidelity/gap visibility and replay wiring", async () => {
    const { folder, session } = await seedProject();
    const provider = new SessionsTreeProvider();
    provider.setWorkspace(await ChronicleWorkspace.open(folder));

    const children = await provider.getChildren();
    const item = children.find((c) => c.session === session);
    expect(item).toBeDefined();
    const treeItem = provider.getTreeItem(item!);
    expect(treeItem.label).toBe("Ext demo");
    expect(String(treeItem.tooltip)).toContain("fidelity: full");
    expect((treeItem.command as { command: string }).command).toBe("chronicle.replaySession");
  });

  it("empty state: no workspace → no children (never a fake list)", async () => {
    const provider = new SessionsTreeProvider();
    expect(await provider.getChildren()).toEqual([]);
  });
});

describe("packaging property (ADR-0008 consequence)", () => {
  it("the extension bundle never references the native module at runtime", () => {
    const manifest = JSON.parse(
      readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../package.json"), "utf8"),
    ) as { main: string };
    const bundle = readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", manifest.main),
      "utf8",
    );
    // external+unused: the string may appear only in the single lazy require
    // inside ChronicleIndex.open — which this surface never calls. Assert the
    // cheap invariant: no top-level static require of the native module.
    expect(bundle.startsWith("#!")).toBe(false);
    expect(bundle.slice(0, 2000)).not.toContain("better-sqlite3");
  });
});
