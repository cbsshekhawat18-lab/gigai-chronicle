/**
 * Manifest/module-format contract — found by founder testing: with
 * type:module in the manifest, a .js CJS bundle is loaded as ESM by VS Code
 * and the extension silently never activates. The entry must be .cjs (or
 * type:module must go). This test pins the invariant.
 */
import { readFileSync, existsSync } from "node:fs";
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
