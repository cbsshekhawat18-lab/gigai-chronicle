/**
 * Provider unit + e2e: hook mapping, live capture through the real engine,
 * fingerprinted transcript parsing, idempotent backfill, settings etiquette,
 * capability conformance. Fixtures are synthetic (SECURITY.md).
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { newId, parseChronicleEventLine } from "@gigaichronicle/schema";
import {
  CAPABILITY,
  CAPTURED_HOOK_EVENTS,
  SessionMap,
  cwdSlug,
  captureState,
  findOnPath,
  hookCommandFor,
  installHooks,
  mapHookToCandidate,
  parseTranscript,
  renderInstallPlan,
  runBackfill,
  runCapture,
  settingsPathFor,
  uninstallHooks,
  wireCapture,
} from "../src/index.js";

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures");

const dirs: string[] = [];
function tempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeStore(): string {
  const root = tempDir("cc-provider ");
  execFileSync("git", ["-C", root, "init", "-q"]);
  const chronicleDir = path.join(root, ".chronicle");
  mkdirSync(chronicleDir);
  return chronicleDir;
}

/**
 * Read stored event types via raw files + the schema parser — deliberately
 * NOT via core (the boundary lint scans provider tests too, and providers
 * must never grow a habit of reading the store).
 */
async function storedTypes(chronicleDir: string): Promise<string[]> {
  const types: Array<{ ts: string; type: string }> = [];
  for (const root of ["sessions", ".local/ops"]) {
    const rootDir = path.join(chronicleDir, ...root.split("/"));
    let entries: string[] = [];
    try {
      entries = (readdirSync(rootDir, { recursive: true }) as string[]).map(String);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith(".jsonl")) continue;
      for (const line of readFileSync(path.join(rootDir, entry), "utf8").split("\n")) {
        if (line.trim() === "") continue;
        const verdict = parseChronicleEventLine(line);
        if (verdict.ok) types.push({ ts: verdict.event.ts, type: verdict.event.type });
      }
    }
  }
  return Promise.resolve(types.sort((a, b) => a.ts.localeCompare(b.ts)).map((t) => t.type));
}

describe("hook mapping", () => {
  const session = newId("session");
  it("maps the five installed events", () => {
    expect(
      mapHookToCandidate("UserPromptSubmit", { prompt: "add rotation" }, session, null),
    ).toMatchObject({ type: "PromptSubmitted", payload: { text: "add rotation" } });
    expect(mapHookToCandidate("SessionStart", { source: "startup" }, session, null)).toMatchObject({
      type: "SessionStarted",
    });
    expect(mapHookToCandidate("SessionEnd", { reason: "exit" }, session, null)).toMatchObject({
      type: "SessionEnded",
      payload: { reason: "completed" },
    });
    expect(mapHookToCandidate("Stop", {}, session, "the answer")).toMatchObject({
      type: "AIResponseReceived",
      payload: { text: "the answer" },
    });
    expect(
      mapHookToCandidate(
        "PostToolUse",
        { tool_name: "Edit", tool_input: { file_path: "src/a.ts" }, tool_response: {} },
        session,
        null,
      ),
    ).toMatchObject({ type: "ToolExecuted", payload: { tool: "Edit", outcome: "success" } });
  });

  it("flags failed tools and rejects malformed input with null (degrade path)", () => {
    expect(
      mapHookToCandidate("PostToolUse", { tool_name: "bash", tool_response: { is_error: true } }, session, null),
    ).toMatchObject({ payload: { outcome: "failure" } });
    expect(mapHookToCandidate("UserPromptSubmit", {}, session, null)).toBeNull();
    expect(mapHookToCandidate("SomethingNew", {}, session, null)).toBeNull();
  });
});

describe("live capture (runCapture through the real engine)", () => {
  it("two hooks with the same tool session map to one chronicle session", async () => {
    const chronicleDir = makeStore();
    const stdin = JSON.stringify({ session_id: "uuid-1", prompt: "first prompt" });
    expect((await runCapture(chronicleDir, "UserPromptSubmit", stdin)).ok).toBe(true);
    const stdin2 = JSON.stringify({ session_id: "uuid-1", prompt: "second prompt" });
    expect((await runCapture(chronicleDir, "UserPromptSubmit", stdin2)).ok).toBe(true);

    const map = SessionMap.load(chronicleDir);
    const session = map.resolve("uuid-1");
    expect(map.resolve("uuid-1")).toBe(session); // stable
    expect(await storedTypes(chronicleDir)).toEqual(["PromptSubmitted", "PromptSubmitted"]);
  });

  it("never throws: garbage stdin and unknown events degrade, ok:false", async () => {
    const chronicleDir = makeStore();
    expect((await runCapture(chronicleDir, "UserPromptSubmit", "not json{{{")).ok).toBe(false);
    expect((await runCapture(chronicleDir, "FutureHook", JSON.stringify({ session_id: "u" }))).ok).toBe(false);
    const types = await storedTypes(chronicleDir);
    expect(types.filter((t) => t === "CaptureDegraded").length).toBeGreaterThanOrEqual(2);
  });
});

describe("transcript parsing (fingerprinted)", () => {
  it("parses the basic fixture into a bracketed session", () => {
    const lines = readFileSync(path.join(FIXTURES, "session-basic.jsonl"), "utf8").split("\n");
    const parsed = parseTranscript(lines, newId("session"));
    expect(parsed.drifted).toBe(false);
    expect(parsed.toolSessionUuid).toBe("11111111-2222-3333-4444-555555555555");
    expect(parsed.candidates.map((c) => c.type)).toEqual([
      "SessionStarted",
      "PromptSubmitted",
      "AIResponseReceived",
      "ToolExecuted",
      "AIResponseReceived",
      "SessionEnded",
    ]);
    expect(parsed.candidates[0]?.payload).toMatchObject({
      title: "Add refresh-token rotation to the auth middleware",
    });
    // Model identity rides on every agent candidate (badges & filters).
    for (const c of parsed.candidates) {
      if (c.type === "AIResponseReceived" || c.type === "ToolExecuted") {
        expect(c.actor?.model).toBe("example-model-1");
      }
    }
  });

  it("CI canary: the current-format fixture must parse with zero unknown lines", () => {
    const lines = readFileSync(path.join(FIXTURES, "session-basic.jsonl"), "utf8").split("\n");
    const parsed = parseTranscript(lines, newId("session"));
    expect(parsed.linesUnknown).toBe(0); // red build = the format moved under us
  });

  it("future-format fixture drifts → zero candidates, flagged", () => {
    const lines = readFileSync(path.join(FIXTURES, "session-future-format.jsonl"), "utf8").split("\n");
    const parsed = parseTranscript(lines, newId("session"));
    expect(parsed.drifted).toBe(true);
    expect(parsed.candidates).toEqual([]);
  });
});

describe("backfill (idempotent, fail-soft)", () => {
  function transcriptsFixtureRoot(workspacePath: string): string {
    const root = tempDir("cc-transcripts ");
    const dir = path.join(root, cwdSlug(path.resolve(workspacePath))); // same resolution as transcriptDirsFor
    mkdirSync(dir, { recursive: true });
    cpSync(path.join(FIXTURES, "session-basic.jsonl"), path.join(dir, "11111111-2222-3333-4444-555555555555.jsonl"));
    cpSync(path.join(FIXTURES, "session-future-format.jsonl"), path.join(dir, "99999999-8888-7777-6666-555555555555.jsonl"));
    return root;
  }

  it("imports the fixture month, skips drifted files with a degradation, reruns are no-ops", async () => {
    const chronicleDir = makeStore();
    const workspacePath = path.dirname(chronicleDir);
    const transcriptsRoot = transcriptsFixtureRoot(workspacePath);

    const report = await runBackfill(chronicleDir, {
      knownWorkspacePaths: [workspacePath],
      transcriptsRoot,
    });
    expect(report).toMatchObject({ filesImported: 1, filesSkippedDrift: 1, gaps: 0 });
    expect(report.eventsImported).toBe(6);

    const again = await runBackfill(chronicleDir, {
      knownWorkspacePaths: [workspacePath],
      transcriptsRoot,
    });
    expect(again.eventsImported).toBe(0); // idempotent

    const types = await storedTypes(chronicleDir);
    expect(types.filter((t) => t === "PromptSubmitted")).toHaveLength(1);
    expect(types.filter((t) => t === "CaptureDegraded")).toHaveLength(1); // drift recorded once? (re-degrades on rerun is acceptable but cursor skips) —
  });

  it("finds transcripts under MOVED workspace paths", async () => {
    const chronicleDir = makeStore();
    const oldPath = "/somewhere/else/old-name";
    const transcriptsRoot = transcriptsFixtureRoot(oldPath);
    const report = await runBackfill(chronicleDir, {
      knownWorkspacePaths: [path.dirname(chronicleDir), oldPath],
      transcriptsRoot,
    });
    expect(report.filesImported).toBe(1);
  });
});

describe("settings merge etiquette", () => {
  it("install shows a plan, merges without clobbering, is idempotent; uninstall removes only ours", () => {
    const root = tempDir("cc-settings ");
    const file = settingsPathFor(root, "project");
    mkdirSync(path.dirname(file), { recursive: true });
    const existing = {
      permissions: { allow: ["Bash(npm:*)"] },
      hooks: { PostToolUse: [{ hooks: [{ type: "command", command: "eslint --fix" }] }] },
    };
    writeFileSync(file, JSON.stringify(existing, null, 2) + "\n");

    expect(renderInstallPlan(file)).toHaveLength(CAPTURED_HOOK_EVENTS.length);
    expect(installHooks(file)).toBe(true);
    expect(installHooks(file)).toBe(false); // idempotent

    const merged = JSON.parse(readFileSync(file, "utf8"));
    expect(merged.permissions).toEqual(existing.permissions); // untouched
    expect(merged.hooks.PostToolUse[0].hooks[0].command).toBe("eslint --fix"); // preserved
    expect(merged.hooks.PostToolUse[1].hooks[0].command).toContain("chronicle capture claude-code");
    expect(merged.hooks.SessionStart[0].hooks[0].command).toContain("--event SessionStart");

    expect(uninstallHooks(file)).toBe(true);
    const restored = JSON.parse(readFileSync(file, "utf8"));
    expect(restored).toEqual(existing); // byte-equal semantics: only ours removed
    expect(uninstallHooks(file)).toBe(false);
  });
});

/**
 * A PATH holding a fake `chronicle` (an executable shell script, or a .cmd on
 * Windows) — so "is the CLI installed?" is the test's property, not the
 * machine's. Returns the env to pass as `{ env }`.
 */
function pathWithChronicle(): { PATH: string; PATHEXT?: string } {
  const bin = tempDir("cc-bin ");
  if (process.platform === "win32") {
    writeFileSync(path.join(bin, "chronicle.cmd"), "@exit /b 0\r\n");
    return { PATH: bin, PATHEXT: ".COM;.EXE;.BAT;.CMD" };
  }
  writeFileSync(path.join(bin, "chronicle"), "#!/bin/sh\nexit 0\n");
  chmodSync(path.join(bin, "chronicle"), 0o755);
  return { PATH: bin };
}
const PATH_WITHOUT_CHRONICLE = { PATH: "" };

describe("wireCapture (the one place every surface starts capture)", () => {
  it("wires the project scope and reports it live when the CLI resolves", () => {
    const root = tempDir("cc-wire ");
    const env = pathWithChronicle();
    expect(captureState(root, { env })).toEqual({ live: false, status: "off", scope: null, cliPath: null });

    const wired = wireCapture(root, { env });
    expect(wired).toMatchObject({ file: ".claude/settings.json", live: true, status: "live", changed: true, scope: "project" });
    expect(wired.cliPath).toContain(env.PATH);
    expect(captureState(root, { env })).toMatchObject({ live: true, status: "live", scope: "project" });

    expect(wireCapture(root, { env }).changed).toBe(false); // idempotent — no second write
  });

  it("hooks without the CLI on PATH are NOT live — the third state, cli-missing", () => {
    const root = tempDir("cc-wire-nocli ");
    const wired = wireCapture(root, { env: PATH_WITHOUT_CHRONICLE });
    // The hooks went in (and are reported), but nothing will be recorded.
    expect(wired).toEqual({
      file: ".claude/settings.json",
      live: false,
      status: "cli-missing",
      changed: true,
      scope: "project",
      cliPath: null,
    });
    expect(captureState(root, { env: PATH_WITHOUT_CHRONICLE })).toEqual({
      live: false,
      status: "cli-missing",
      scope: "project",
      cliPath: null,
    });
    // Same hooks, CLI installed later → live, with no rewiring needed.
    expect(captureState(root, { env: pathWithChronicle() }).status).toBe("live");
  });

  it("user-scope hooks win: installing at both scopes would double every event", () => {
    const home = tempDir("cc-wire-home ");
    const root = tempDir("cc-wire-repo ");
    installHooks(settingsPathFor(root, "user", home));

    const wired = wireCapture(root, { home, env: pathWithChronicle() });
    expect(wired).toMatchObject({ file: null, live: true, status: "live", changed: false, scope: "user" });
    expect(existsSync(path.join(root, ".claude"))).toBe(false); // nothing written to the repo
    expect(wireCapture(root, { home, env: PATH_WITHOUT_CHRONICLE })).toMatchObject({
      scope: "user",
      status: "cli-missing",
      live: false,
    });
  });
});

describe("findOnPath (the shell's lookup, without a shell)", () => {
  it("POSIX: finds an executable, ignores a non-executable file and empty entries", () => {
    const withCli = tempDir("cc-path-x ");
    const notExecutable = tempDir("cc-path-nx ");
    writeFileSync(path.join(notExecutable, "chronicle"), "#!/bin/sh\n");
    chmodSync(path.join(notExecutable, "chronicle"), 0o644);
    writeFileSync(path.join(withCli, "chronicle"), "#!/bin/sh\n");
    chmodSync(path.join(withCli, "chronicle"), 0o755);

    const env = { PATH: ["", notExecutable, withCli].join(":") };
    if (process.platform !== "win32") {
      expect(findOnPath("chronicle", { env, platform: "linux" })).toBe(path.join(withCli, "chronicle"));
      expect(findOnPath("chronicle", { env: { PATH: notExecutable }, platform: "linux" })).toBeNull();
    }
    // An empty entry means "cwd" to a POSIX shell — never counted as installed.
    expect(findOnPath("chronicle", { env: { PATH: "" }, platform: "linux" })).toBeNull();
    expect(findOnPath("chronicle", { env: {}, platform: "linux" })).toBeNull();
  });

  it("Windows: PATHEXT shims (chronicle.cmd), case-insensitive Path, quoted entries", () => {
    const bin = tempDir("cc-path-win ");
    writeFileSync(path.join(bin, "chronicle.cmd"), "@exit /b 0\r\n");
    const env = { Path: `"${bin}";C:\\nowhere`, PathExt: ".COM;.EXE;.BAT;.CMD" };
    expect(findOnPath("chronicle", { env, platform: "win32" })).toBe(path.join(bin, "chronicle.cmd"));
    // Default PATHEXT applies when unset; a bare `chronicle` file is not runnable there.
    expect(findOnPath("chronicle", { env: { PATH: bin }, platform: "win32" })).toBe(path.join(bin, "chronicle.cmd"));
    const bareOnly = tempDir("cc-path-win-bare ");
    writeFileSync(path.join(bareOnly, "chronicle"), "");
    expect(findOnPath("chronicle", { env: { PATH: bareOnly }, platform: "win32" })).toBeNull();
  });
});

describe("hook command is quiet without the CLI (ADR-0018)", () => {
  it("installs `; exit 0` commands, upgrades the old bare form in place, uninstall removes both", () => {
    const root = tempDir("cc-hookform ");
    const file = settingsPathFor(root, "project");
    mkdirSync(path.dirname(file), { recursive: true });
    // A settings file written by Chronicle ≤0.5.0 (bare form) next to a user hook.
    writeFileSync(
      file,
      JSON.stringify({
        hooks: {
          Stop: [
            { hooks: [{ type: "command", command: "say done" }] },
            { hooks: [{ type: "command", command: "chronicle capture claude-code --event Stop" }] },
          ],
        },
      }),
    );
    expect(hookCommandFor("Stop")).toBe("chronicle capture claude-code --event Stop; exit 0");
    expect(captureState(root, { env: pathWithChronicle() }).status).toBe("off"); // only Stop present
    expect(renderInstallPlan(file).some((line) => line.startsWith("hooks.Stop ~"))).toBe(true);

    expect(installHooks(file)).toBe(true);
    const merged = JSON.parse(readFileSync(file, "utf8"));
    expect(merged.hooks.Stop).toEqual([
      { hooks: [{ type: "command", command: "say done" }] }, // untouched
      { hooks: [{ type: "command", command: "chronicle capture claude-code --event Stop; exit 0" }] }, // upgraded in place
    ]);
    for (const event of CAPTURED_HOOK_EVENTS) {
      const commands = merged.hooks[event].flatMap((e: { hooks: Array<{ command: string }> }) => e.hooks.map((h) => h.command));
      expect(commands.filter((c: string) => c.startsWith("chronicle capture"))).toEqual([hookCommandFor(event)]);
    }
    expect(installHooks(file)).toBe(false); // idempotent after the upgrade
    expect(renderInstallPlan(file)).toEqual([]);

    expect(uninstallHooks(file)).toBe(true);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({
      hooks: { Stop: [{ hooks: [{ type: "command", command: "say done" }] }] },
    });
  });

  // The real thing: run the installed command through the shells Claude Code
  // uses (sh -c on POSIX, Git Bash on Windows; PowerShell on Windows without
  // Git Bash) with and without a `chronicle` on PATH.
  const shells: Array<{ name: string; argv: (cmd: string) => [string, string[]] }> = [];
  const has = (bin: string, probe: string[]): boolean => {
    try {
      execFileSync(bin, probe, { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  };
  if (has("sh", ["-c", "exit 0"])) shells.push({ name: "sh", argv: (cmd) => ["sh", ["-c", cmd]] });
  for (const ps of ["pwsh", "powershell"]) {
    if (has(ps, ["-NoProfile", "-Command", "exit 0"])) {
      shells.push({ name: ps, argv: (cmd) => [ps, ["-NoProfile", "-NonInteractive", "-Command", cmd]] });
      break;
    }
  }

  for (const shell of shells) {
    it(`${shell.name}: exits 0 when chronicle is absent; runs it with the event when present`, () => {
      const command = hookCommandFor("Stop");
      const [bin, args] = shell.argv(command);
      const shellDir = path.dirname(execFileSync(process.platform === "win32" ? "where" : "which", [bin], { encoding: "utf8" }).split(/\r?\n/)[0] as string);
      // Absent: only the shell's own directory on PATH.
      const absent = spawnSync(bin, args, { env: { ...process.env, PATH: shellDir, Path: shellDir }, input: "{}" });
      expect(absent.status, String(absent.stderr)).toBe(0);

      // Present: a fake chronicle that records the args it was called with.
      const bin2 = tempDir("cc-fake-cli ");
      const record = path.join(bin2, "args.txt");
      // Like npm's global install: an extensionless sh shim (what bash / Git
      // Bash runs) and, on Windows, a .cmd shim (what PowerShell runs).
      writeFileSync(path.join(bin2, "chronicle"), `#!/bin/sh\necho "$@" > '${record.replace(/\\/g, "/")}'\n`);
      chmodSync(path.join(bin2, "chronicle"), 0o755);
      if (process.platform === "win32") {
        writeFileSync(path.join(bin2, "chronicle.cmd"), `@echo %* > "${record}"\r\n@exit /b 0\r\n`);
      }
      const pathWith = [bin2, shellDir].join(path.delimiter);
      const present = spawnSync(bin, args, { env: { ...process.env, PATH: pathWith, Path: pathWith }, input: "{}" });
      expect(present.status, String(present.stderr)).toBe(0);
      expect(readFileSync(record, "utf8").trim()).toBe("capture claude-code --event Stop");
    });
  }
});

describe("capability conformance", () => {
  it("matches the PROVIDERS.md row (tier 1, Full replay, low risk)", () => {
    expect(CAPABILITY).toEqual({
      captureTier: 1,
      replayFidelity: "full",
      maintenanceRisk: "low",
      prompts: true,
      toolCalls: true,
      files: true,
      gitCorrelation: true,
    });
  });
});
