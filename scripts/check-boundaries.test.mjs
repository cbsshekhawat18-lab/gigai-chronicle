/**
 * Tests for the architecture boundary linter.
 *
 * Runs with the Node built-in test runner (`node --test scripts/`), so repo
 * tooling has zero test-framework dependencies.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { checkBoundaries, extractSpecifiers } from "./check-boundaries.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Create a throwaway workspace; returns its root. Caller cleans up. */
function makeWorkspace() {
  const root = mkdtempSync(path.join(tmpdir(), "chronicle-boundaries-"));
  writeFileSync(path.join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
  return root;
}

function addPackage(root, relDir, name, { deps = {}, files = {} } = {}) {
  const dir = path.join(root, relDir);
  mkdirSync(path.join(dir, "src"), { recursive: true });
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name, version: "0.0.0", dependencies: deps }, null, 2),
  );
  for (const [relFile, content] of Object.entries(files)) {
    const abs = path.join(dir, relFile);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
}

test("compliant workspace passes", () => {
  const root = makeWorkspace();
  try {
    addPackage(root, "packages/schema", "@gigaichronicle/schema");
    addPackage(root, "packages/core", "@gigaichronicle/core", {
      deps: { "@gigaichronicle/schema": "workspace:^" },
      files: { "src/index.ts": `import "@gigaichronicle/schema";\nexport {};\n` },
    });
    const { violations } = checkBoundaries(root);
    assert.deepEqual(violations, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pipeline rule: provider may import core only via the emit surface", () => {
  const root = makeWorkspace();
  try {
    addPackage(root, "packages/core", "@gigaichronicle/core");
    addPackage(root, "packages/providers/claude-code", "@gigaichronicle/provider-claude-code", {
      deps: { "@gigaichronicle/core": "workspace:^" },
      files: {
        "src/bad.ts": `import { open } from "@gigaichronicle/core/store";\n`,
        "src/good.ts": `import { emit } from "@gigaichronicle/core/emit";\n`,
      },
    });
    const { violations } = checkBoundaries(root);
    assert.equal(violations.length, 1, violations.join("\n"));
    assert.match(violations[0], /pipeline rule/);
    assert.match(violations[0], /core\/store/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dependency direction: core must not depend on a provider", () => {
  const root = makeWorkspace();
  try {
    addPackage(root, "packages/providers/x", "@gigaichronicle/provider-x");
    addPackage(root, "packages/core", "@gigaichronicle/core", {
      deps: { "@gigaichronicle/provider-x": "workspace:^" },
    });
    const { violations } = checkBoundaries(root);
    assert.equal(violations.length, 1, violations.join("\n"));
    assert.match(violations[0], /illegal dependency/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("nothing may depend on an app", () => {
  const root = makeWorkspace();
  try {
    addPackage(root, "apps/cli", "@gigaichronicle/cli");
    addPackage(root, "packages/core", "@gigaichronicle/core", {
      deps: { "@gigaichronicle/cli": "workspace:^" },
    });
    const { violations } = checkBoundaries(root);
    assert.equal(violations.length, 1, violations.join("\n"));
    assert.match(violations[0], /nothing may depend on apps/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("undeclared workspace imports are flagged", () => {
  const root = makeWorkspace();
  try {
    addPackage(root, "packages/schema", "@gigaichronicle/schema");
    addPackage(root, "packages/core", "@gigaichronicle/core", {
      files: { "src/index.ts": `import "@gigaichronicle/schema";\n` },
    });
    const { violations } = checkBoundaries(root);
    assert.equal(violations.length, 1, violations.join("\n"));
    assert.match(violations[0], /without declaring it/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ui may depend on schema only", () => {
  const root = makeWorkspace();
  try {
    addPackage(root, "packages/schema", "@gigaichronicle/schema");
    addPackage(root, "packages/core", "@gigaichronicle/core");
    addPackage(root, "packages/ui", "@gigaichronicle/ui", {
      deps: {
        "@gigaichronicle/schema": "workspace:^",
        "@gigaichronicle/core": "workspace:^",
      },
    });
    const { violations } = checkBoundaries(root);
    assert.equal(violations.length, 1, violations.join("\n"));
    assert.match(violations[0], /\(ui\): illegal dependency on "@gigaichronicle\/core"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("specifier extraction covers static, re-export, dynamic, and require forms", () => {
  const source = [
    `import a from "pkg-a";`,
    `import "pkg-b";`,
    `export { x } from "pkg-c";`,
    `const d = await import("pkg-d");`,
    `const e = require("pkg-e");`,
  ].join("\n");
  assert.deepEqual(extractSpecifiers(source).sort(), ["pkg-a", "pkg-b", "pkg-c", "pkg-d", "pkg-e"]);
});

test("the actual repository is clean", () => {
  const { violations, packages } = checkBoundaries(REPO_ROOT);
  assert.deepEqual(violations, []);
  assert.ok(packages.length >= 7, `expected the 7 scaffold packages, saw ${packages.length}`);
});
