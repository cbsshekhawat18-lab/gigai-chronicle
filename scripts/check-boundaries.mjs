/**
 * Architecture boundary linter.
 *
 * Enforces the two structural laws of ARCHITECTURE.md §12 as CI failures:
 *
 *   1. Dependency direction:  schema ← core ← plugin-kit/providers ← apps,
 *      with `ui` depending on schema only, and nothing depending on apps.
 *   2. Pipeline rule: provider packages may import from @gigaichronicle/core
 *      ONLY via the Event Engine emit surface ("@gigaichronicle/core/emit").
 *      Store, replay, and query modules are off-limits to providers.
 *
 * Deliberately regex-based (no parser dependency): it scans static import /
 * export-from / dynamic import() / require() specifiers. That is sufficient
 * for a lint whose job is to catch honest mistakes loudly; it is not a
 * security boundary.
 *
 * Usage:   node scripts/check-boundaries.mjs [rootDir]
 * Exit:    0 clean · 1 violations · 2 usage/config error
 */

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Workspace glob roots — keep in sync with pnpm-workspace.yaml. */
const WORKSPACE_DIRS = ["packages", "packages/providers", "apps"];

/** Directories under a package that are scanned for imports. */
const SOURCE_DIRS = ["src", "test"];

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"]);

/** The only core subpath providers may import (the Event Engine emit surface). */
const PROVIDER_ALLOWED_CORE_SUBPATH = "@gigaichronicle/core/emit";

/**
 * Which workspace roles may declare/import which other roles.
 * Role names derive from package location, not package name, so the rules
 * hold even if a package is renamed.
 */
const ALLOWED_ROLE_DEPS = {
  schema: [],
  core: ["schema"],
  "plugin-kit": ["schema", "core"],
  ui: ["schema"],
  provider: ["schema", "core", "plugin-kit"], // core restricted further by the pipeline rule
  app: ["schema", "core", "plugin-kit", "ui", "provider"],
};

/** @returns {"schema"|"core"|"plugin-kit"|"ui"|"provider"|"app"|null} */
function roleForRelativeDir(relDir) {
  const parts = relDir.split(path.sep);
  if (parts[0] === "apps") return "app";
  if (parts[0] === "packages" && parts[1] === "providers") return "provider";
  if (parts[0] === "packages") {
    if (parts[1] === "schema") return "schema";
    if (parts[1] === "core") return "core";
    if (parts[1] === "plugin-kit") return "plugin-kit";
    if (parts[1] === "ui") return "ui";
    // Future packages under packages/* default to the strictest useful rule:
    // treat as plugin-kit-level (schema+core). Revisit per-package when added.
    return "plugin-kit";
  }
  return null;
}

/** Discover workspace packages: { name, dir, relDir, role, manifest }. */
export function discoverPackages(rootDir) {
  const found = [];
  for (const wsDir of WORKSPACE_DIRS) {
    const abs = path.join(rootDir, wsDir);
    if (!existsSync(abs)) continue;
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      // "packages/providers" is itself listed as a workspace dir; skip the
      // container when scanning "packages".
      if (wsDir === "packages" && entry.name === "providers") continue;
      const dir = path.join(abs, entry.name);
      const manifestPath = path.join(dir, "package.json");
      if (!existsSync(manifestPath)) continue;
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      const relDir = path.relative(rootDir, dir);
      found.push({
        name: manifest.name,
        dir,
        relDir,
        role: roleForRelativeDir(relDir),
        manifest,
      });
    }
  }
  return found;
}

function* walkSourceFiles(pkgDir) {
  for (const srcDir of SOURCE_DIRS) {
    const stack = [path.join(pkgDir, srcDir)];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!existsSync(current) || !statSync(current).isDirectory()) continue;
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) yield full;
      }
    }
  }
}

/**
 * Extract module specifiers from one source file (static + dynamic + require).
 *
 * The `[^;'"]` clause bodies keep a match from spanning across statement
 * boundaries (an import/export clause never contains quotes or semicolons),
 * so `import "a"; export { x } from "b";` yields both specifiers instead of
 * one mangled span.
 */
export function extractSpecifiers(sourceText) {
  const specifiers = new Set();
  const patterns = [
    /(?:^|[^\w.])import\s+(?:[^;'"]*?\sfrom\s+)?["']([^"'\n]+)["']/gm, // import x from "s" | import "s"
    /(?:^|[^\w.])export\s+[^;'"]*?\sfrom\s+["']([^"'\n]+)["']/gm, //      export ... from "s"
    /import\s*\(\s*["']([^"'\n]+)["']\s*\)/g, //                          import("s")
    /require\s*\(\s*["']([^"'\n]+)["']\s*\)/g, //                         require("s")
  ];
  for (const pattern of patterns) {
    for (const match of sourceText.matchAll(pattern)) specifiers.add(match[1]);
  }
  return [...specifiers];
}

/** "@scope/name/sub/path" → "@scope/name"; "name/sub" → "name". */
function packageNameOf(specifier) {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

/**
 * Run all boundary checks. Pure: reads the tree, returns violations.
 * @returns {{ violations: string[], packages: Array<{name: string, role: string}> }}
 */
export function checkBoundaries(rootDir) {
  const packages = discoverPackages(rootDir);
  const byName = new Map(packages.map((p) => [p.name, p]));
  const violations = [];

  for (const pkg of packages) {
    if (!pkg.role) {
      violations.push(`${pkg.relDir}: not in a recognized workspace location`);
      continue;
    }
    const allowedRoles = ALLOWED_ROLE_DEPS[pkg.role];

    const declared = new Set(
      ["dependencies", "devDependencies", "peerDependencies"].flatMap((key) =>
        Object.keys(pkg.manifest[key] ?? {}),
      ),
    );

    // Rule set A — declared workspace dependencies obey the role matrix.
    for (const depName of declared) {
      const target = byName.get(depName);
      if (!target || target.name === pkg.name) continue;
      if (target.role === "app") {
        violations.push(
          `${pkg.name}: depends on app package "${depName}" — nothing may depend on apps (ARCHITECTURE.md §12)`,
        );
      } else if (!allowedRoles.includes(target.role)) {
        violations.push(
          `${pkg.name} (${pkg.role}): illegal dependency on "${depName}" (${target.role}) — allowed roles: ${allowedRoles.join(", ") || "none"}`,
        );
      }
    }

    // Rule set B — source imports: role matrix, pipeline rule, undeclared deps.
    for (const file of walkSourceFiles(pkg.dir)) {
      const relFile = path.relative(rootDir, file);
      for (const specifier of extractSpecifiers(readFileSync(file, "utf8"))) {
        const targetName = packageNameOf(specifier);
        const target = byName.get(targetName);
        if (!target || target.name === pkg.name) continue;

        if (target.role === "app") {
          violations.push(`${relFile}: imports app package "${specifier}"`);
          continue;
        }
        if (!allowedRoles.includes(target.role)) {
          violations.push(
            `${relFile}: ${pkg.role} package imports "${specifier}" (${target.role}) — allowed roles: ${allowedRoles.join(", ") || "none"}`,
          );
          continue;
        }
        if (
          pkg.role === "provider" &&
          target.role === "core" &&
          specifier !== PROVIDER_ALLOWED_CORE_SUBPATH &&
          !specifier.startsWith(`${PROVIDER_ALLOWED_CORE_SUBPATH}/`)
        ) {
          violations.push(
            `${relFile}: pipeline rule — providers may import core only via "${PROVIDER_ALLOWED_CORE_SUBPATH}", found "${specifier}" (ARCHITECTURE.md §3)`,
          );
          continue;
        }
        if (!declared.has(targetName)) {
          violations.push(
            `${relFile}: imports "${targetName}" without declaring it in package.json`,
          );
        }
      }
    }
  }

  return { violations, packages: packages.map((p) => ({ name: p.name, role: p.role })) };
}

function main() {
  const rootDir = path.resolve(process.argv[2] ?? process.cwd());
  if (!existsSync(path.join(rootDir, "pnpm-workspace.yaml"))) {
    console.error(`check-boundaries: no pnpm-workspace.yaml in ${rootDir}`);
    process.exit(2);
  }
  const { violations, packages } = checkBoundaries(rootDir);
  if (violations.length > 0) {
    console.error(`check-boundaries: ${violations.length} violation(s)\n`);
    for (const violation of violations) console.error(`  ✗ ${violation}`);
    process.exit(1);
  }
  console.log(`check-boundaries: OK (${packages.length} workspace packages clean)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
