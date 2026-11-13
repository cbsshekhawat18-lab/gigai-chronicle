/**
 * Manifest/module-format contract — found by founder testing: with
 * type:module in the manifest, a .js CJS bundle is loaded as ESM by VS Code
 * and the extension silently never activates. The entry must be .cjs (or
 * type:module must go). This test pins the invariant.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
  type?: string;
  main: string;
};

describe("extension manifest contract", () => {
  it("CJS entry cannot be shadowed by type:module", () => {
    if (manifest.type === "module") {
      expect(manifest.main.endsWith(".cjs")).toBe(true);
    }
  });

  it("built entry exists and parses as CommonJS", () => {
    const entry = path.join(ROOT, manifest.main);
    expect(existsSync(entry)).toBe(true);
    const head = readFileSync(entry, "utf8").slice(0, 4000);
    expect(head).not.toMatch(/^\s*import\s/m); // no top-level ESM imports
  });
});

describe("build output contract", () => {
  const bundles = [manifest.main.replace(/^\.\//, ""), "dist/timeline.js", "dist/sessions.js"];

  it("bundles are minified, with LINKED sourcemaps next to them", () => {
    for (const bundle of bundles) {
      const code = readFileSync(path.join(ROOT, bundle), "utf8");
      // Minified: very long lines (template literals keep a few newlines, so
      // count average length — unminified esbuild output averages ~40 chars).
      expect(code.length / code.split("\n").length, bundle).toBeGreaterThan(400);
      const mapName = `${path.basename(bundle)}.map`;
      expect(code.trimEnd().endsWith(`//# sourceMappingURL=${mapName}`), bundle).toBe(true);
      expect(existsSync(path.join(ROOT, "dist", mapName)), mapName).toBe(true);
    }
  });

  it("the build has zero esbuild warnings (incl. import.meta in the CJS bundle)", () => {
    // --check builds in memory and exits 1 on any warning; nothing is written,
    // so it can't race the other suites that read dist/.
    const out = execFileSync(process.execPath, [path.join(ROOT, "scripts", "build.mjs"), "--check"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    expect(out).toContain("0 warning(s)");
  });

  it("the .vsix ships the bundles but never the sourcemaps", () => {
    const require = createRequire(import.meta.url);
    const vsceDir = path.dirname(require.resolve("@vscode/vsce/package.json"));
    const listed = execFileSync(process.execPath, [path.join(vsceDir, "vsce"), "ls", "--no-dependencies"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== "");
    for (const bundle of bundles) expect(listed).toContain(bundle);
    expect(listed.filter((file) => file.endsWith(".map"))).toEqual([]);
    expect(listed.filter((file) => file.endsWith(".vsix"))).toEqual([]);
  });
});

describe("listing honesty (Marketplace / Open VSX / npm text)", () => {
  const full = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
    description: string;
    keywords: string[];
    publisher: string;
    name: string;
    contributes: { commands: Array<{ command: string; title: string }> };
  };
  const readme = readFileSync(path.join(ROOT, "README.md"), "utf8");
  const cli = JSON.parse(readFileSync(path.join(ROOT, "..", "cli", "package.json"), "utf8")) as {
    description: string;
    keywords: string[];
  };
  // Providers that capture today. Cursor/Windsurf are EDITORS it runs in —
  // never claimed as continuity providers.
  const notYetProviders = /\bgemini\b|\baider\b/i;

  it("descriptions claim only the providers that exist (Claude Code live, Codex import)", () => {
    for (const description of [full.description, cli.description]) {
      expect(description).toContain("Claude Code & Codex today");
      expect(description).not.toMatch(notYetProviders);
      expect(description).not.toMatch(/continuity \([^)]*Cursor/i);
    }
    expect(full.keywords.filter((k) => notYetProviders.test(k))).toEqual([]);
    expect(cli.keywords.filter((k) => /gemini|aider|cursor|windsurf/i.test(k))).toEqual([]);
  });

  it("the README command table lists EVERY contributed command by its exact title", () => {
    const table = readme.slice(readme.indexOf("## Commands"), readme.indexOf("## Works everywhere"));
    for (const { command, title } of full.contributes.commands) {
      expect(table, `${command} missing from README`).toContain(`**${title}**`);
    }
  });

  it("Installation has a real install command; Setup says the CLI is required for live capture", () => {
    expect(readme).toContain(`code --install-extension ${full.publisher}.${full.name}`);
    const setup = readme.slice(readme.indexOf("## Setup"), readme.indexOf("## Commands"));
    expect(setup).toContain("Requires the CLI for live capture: `npm i -g gigai-chronicle`");
  });

  it("privacy text is true about checkpoints (snapshots in a local hidden git ref)", () => {
    expect(readme).not.toContain("Never stores your file contents.");
    expect(readme).toContain("refs/chronicle/ckpt/");
  });

  it("the root README says the same: CLI required for live capture, real install command", () => {
    const root = readFileSync(path.join(ROOT, "..", "..", "README.md"), "utf8");
    expect(root).toContain("Requires the CLI for live capture: `npm i -g gigai-chronicle`.");
    expect(root).toContain(`code --install-extension ${full.publisher}.${full.name}`);
    expect(root).not.toContain("Never stores your file contents.");
    expect(root).not.toMatch(/Any AI \(Claude, Codex, Gemini/);
  });
});
