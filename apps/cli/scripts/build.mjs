/**
 * esbuild single-file bundle (ARCHITECTURE.md §14: cold start < 150ms).
 * better-sqlite3 stays external (native, ADR-0008) and is loaded lazily by
 * core only when the index is opened.
 */
import { build } from "esbuild";
import { readFileSync, rmSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

// Clean regeneration — stale entry/chunk files must never ship.
rmSync(new URL("../dist", import.meta.url), { recursive: true, force: true });

await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outdir: "dist",
  splitting: true, // §14: subcommands dynamically imported — separate chunks
  chunkNames: "chunks/[name]-[hash]",
  external: ["better-sqlite3"],
  define: { __CLI_VERSION__: JSON.stringify(pkg.version) },
  banner: {
    js: [
      "#!/usr/bin/env node",
      // ESM bundles referencing external CJS need a require shim.
      "import { createRequire as __cr } from 'node:module';",
      "const require = __cr(import.meta.url);",
    ].join("\n"),
  },
  logLevel: "warning",
});
console.log("cli: bundled dist/main.js");
