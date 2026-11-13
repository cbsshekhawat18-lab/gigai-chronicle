/**
 * Two esbuild bundles: the extension host (CJS — VS Code's loader) and the
 * webview app (IIFE, browser). `vscode` external by contract; better-sqlite3
 * external AND unused (engine.ts uses pure-fs paths only — the .vsix stays
 * platform-independent).
 *
 * Deviation note (recorded in docs/issues/010): §15 names Vite for the
 * webview build; esbuild produces the identical artifact and is already the
 * repo's bundler. Revisit at marketplace-publish time.
 *
 * `node scripts/build.mjs --check` builds in memory (nothing written) and
 * exits 1 on ANY esbuild warning — the test suite runs it so a new warning
 * fails CI instead of scrolling past in the build log.
 */
import { build } from "esbuild";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const check = process.argv.includes("--check");
const absWorkingDir = fileURLToPath(new URL("..", import.meta.url));

/**
 * Minified bundles with LINKED sourcemaps: the .map files sit next to the
 * bundles for local debugging (the extension host and webview devtools pick
 * them up) and .vscodeignore keeps them out of the .vsix.
 */
const shipping = { minify: true, sourcemap: "linked" };

/** @type {import("esbuild").BuildOptions} */
const extensionHost = {
  absWorkingDir,
  entryPoints: ["src/extension.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  // .cjs: the manifest has type:module (workspace convention), so the CJS
  // bundle must carry its own extension or VS Code loads it as ESM and the
  // extension silently never activates (founder-testing find).
  outfile: "dist/extension.cjs",
  external: ["vscode", "better-sqlite3"],
  // core is ESM and uses `createRequire(import.meta.url)` for its lazy
  // native-module load. CJS output has no import.meta (esbuild would leave
  // it EMPTY — and warn), so give it the CJS equivalent: this file's URL.
  define: { "import.meta.url": "__chronicle_import_meta_url" },
  banner: {
    js: 'var __chronicle_import_meta_url = require("node:url").pathToFileURL(__filename).href;',
  },
  ...shipping,
};

/** @type {import("esbuild").BuildOptions} */
const webviews = {
  absWorkingDir,
  entryPoints: ["webview/timeline.tsx", "webview/sessions.tsx"],
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2022",
  outdir: "dist",
  entryNames: "[name]",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  ...shipping,
};

if (check) {
  const warnings = [];
  for (const options of [extensionHost, webviews]) {
    const result = await build({ ...options, write: false, logLevel: "silent" });
    warnings.push(...result.warnings);
  }
  for (const w of warnings) {
    const at = w.location === null ? "" : ` (${w.location.file}:${w.location.line})`;
    console.error(`▲ ${w.text}${at}`);
  }
  console.log(`vscode: build check — ${warnings.length} warning(s)`);
  process.exitCode = warnings.length === 0 ? 0 : 1;
} else {
  rmSync(new URL("../dist", import.meta.url), { recursive: true, force: true });
  await build({ ...extensionHost, logLevel: "warning" });
  await build({ ...webviews, logLevel: "warning" });
  console.log("vscode: bundled extension.cjs + timeline.js + sessions.js");
}
