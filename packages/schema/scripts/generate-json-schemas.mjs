/**
 * Write the language-neutral JSON Schema artifacts (Chronicle Spec v1) to
 * schemas/*.json — committed, published with the package, and guarded
 * against drift by test/jsonschema-drift.test.ts.
 *
 * Run via `pnpm build` (after tsc, which produces the dist/ this reads).
 */
import { mkdirSync, writeFileSync, readdirSync, unlinkSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateAll, serialize } from "./render-schemas.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(packageRoot, "schemas");

const documents = generateAll();

// Clean regeneration: remove stale outputs so renamed types can't linger.
if (existsSync(outDir)) {
  for (const dirent of readdirSync(outDir, { recursive: true, withFileTypes: true })) {
    if (dirent.isFile() && dirent.name.endsWith(".json")) {
      unlinkSync(path.join(dirent.parentPath, dirent.name));
    }
  }
}

for (const [name, doc] of documents) {
  const file = path.join(outDir, `${name}.json`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, serialize(doc));
}
console.log(`generate-json-schemas: wrote ${documents.size} documents to schemas/`);
