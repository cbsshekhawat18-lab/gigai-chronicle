/**
 * Vendor-neutrality audit — M2 DoD #3, and the provider-agnostic
 * constitution (ARCHITECTURE.md §1): no vendor or tool identifier may appear
 * in schema STRUCTURE. Scans every schema-definition source file; the only
 * exemption is index.ts, which carries the implementation package's own name.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");

const VENDOR_TERMS =
  /claude|codex|gemini|cursor|windsurf|copilot|anthropic|openai|google|gigai/i;

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(full);
    else if (entry.name.endsWith(".ts")) yield full;
  }
}

describe("spec neutrality", () => {
  for (const file of sourceFiles(SRC_DIR)) {
    const rel = path.relative(SRC_DIR, file);
    if (rel === "index.ts") continue; // implementation package name lives here
    it(`${rel} contains no vendor identifiers`, () => {
      const offending = readFileSync(file, "utf8")
        .split("\n")
        .map((line, i) => ({ line, number: i + 1 }))
        .filter(({ line }) => VENDOR_TERMS.test(line));
      expect(offending, JSON.stringify(offending, null, 2)).toEqual([]);
    });
  }
});
