/**
 * Drift guard: the committed schemas/*.json artifacts must equal what the
 * current zod definitions render. If this fails, run `pnpm build` in
 * packages/schema and commit the regenerated files — the artifacts are spec
 * surface and must never silently diverge from the definitions.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs tooling module without type declarations.
import { generateAll, serialize } from "../scripts/render-schemas.mjs";

const SCHEMAS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../schemas");

function committedFiles(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...committedFiles(path.join(dir, entry.name), `${prefix}${entry.name}/`));
    else if (entry.name.endsWith(".json")) out.push(`${prefix}${entry.name}`);
  }
  return out.sort();
}

describe("JSON Schema artifacts", () => {
  const documents = generateAll() as Map<string, unknown>;

  it("committed file set matches the generated document set", () => {
    const expected = [...documents.keys()].map((name) => `${name}.json`).sort();
    expect(committedFiles(SCHEMAS_DIR)).toEqual(expected);
  });

  for (const [name, doc] of generateAll() as Map<string, unknown>) {
    it(`schemas/${name}.json is in sync`, () => {
      const committed = readFileSync(path.join(SCHEMAS_DIR, `${name}.json`), "utf8");
      expect(committed).toBe(serialize(doc));
    });
  }
});
