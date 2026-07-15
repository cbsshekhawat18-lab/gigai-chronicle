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
import { rmSync, mkdirSync, writeFileSync } from "node:fs";

rmSync(new URL("../dist", import.meta.url), { recursive: true, force: true });

await build({
  entryPoints: ["src/extension.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  outfile: "dist/extension.js",
  external: ["vscode", "better-sqlite3"],
  logLevel: "warning",
});

await build({
  entryPoints: ["webview/index.tsx"],
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2022",
  outfile: "dist/webview.js",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});

// Activity-bar icon (marketplace-quality art arrives with the listing pass).
mkdirSync(new URL("../media", import.meta.url), { recursive: true });
writeFileSync(
  new URL("../media/icon.svg", import.meta.url),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
  <circle cx="12" cy="12" r="9"/>
  <path d="M12 7v5l3.5 2.5"/>
  <path d="M3.5 12h2M18.5 12h2"/>
</svg>
`,
);
console.log("vscode: bundled dist/extension.js + dist/webview.js");
