/**
 * Two esbuild bundles: the extension host (CJS — VS Code's loader) and the
 * webview app (IIFE, browser). `vscode` external by contract; better-sqlite3
 * external AND unused (engine.ts uses pure-fs paths only — the .vsix stays
 * platform-independent).
 *
 * Deviation note (recorded in docs/issues/010): §15 names Vite for the
 * webview build; esbuild produces the identical artifact and is already the
 * repo's bundler. Revisit at marketplace-publish time.
 */
import { build } from "esbuild";
import { rmSync } from "node:fs";

rmSync(new URL("../dist", import.meta.url), { recursive: true, force: true });

await build({
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
  logLevel: "warning",
});

await build({
  entryPoints: ["webview/timeline.tsx", "webview/sessions.tsx"],
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2022",
  outdir: "dist",
  entryNames: "[name]",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});

console.log("vscode: bundled extension.cjs + timeline.js + sessions.js");
