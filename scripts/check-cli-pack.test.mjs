/**
 * Tests for the CLI publish-shape gate (scripts/check-cli-pack.mjs).
 *
 * The end-to-end half (pnpm pack → npm i -g → chronicle --version) runs in CI
 * as `pnpm release:check`; these pin the detector itself, including against
 * a tarball made the way 0.1.0–0.3.0 were made — plain `npm pack`, which
 * ships `catalog:` verbatim.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { findUnpublishableSpecs, readFileFromTarball } from "./check-cli-pack.mjs";

test("flags catalog: and workspace: in every dependency field", () => {
  const problems = findUnpublishableSpecs(
    JSON.stringify({
      name: "gigai-chronicle",
      dependencies: { "better-sqlite3": "catalog:", commander: "^15.0.0" },
      devDependencies: { "@gigaichronicle/core": "workspace:^" },
      optionalDependencies: { x: "catalog:default" },
      peerDependencies: { y: "workspace:*" },
    }),
  );
  assert.deepEqual(problems, [
    'dependencies.better-sqlite3: "catalog:"',
    'devDependencies.@gigaichronicle/core: "workspace:^"',
    'optionalDependencies.x: "catalog:default"',
    'peerDependencies.y: "workspace:*"',
  ]);
});

test("a manifest with only real ranges is publishable", () => {
  assert.deepEqual(
    findUnpublishableSpecs(
      JSON.stringify({
        name: "gigai-chronicle",
        dependencies: { "better-sqlite3": "^12.0.0" },
        devDependencies: { "@gigaichronicle/core": "^0.1.0" },
      }),
    ),
    [],
  );
});

test("the raw-text sweep catches a protocol outside the dependency fields", () => {
  const problems = findUnpublishableSpecs(
    JSON.stringify({ name: "x", pnpm: { overrides: { a: "catalog:" } } }),
  );
  assert.deepEqual(problems, ['raw manifest contains "catalog:"']);
});

test("reproduces the 0.1.0–0.3.0 bug: a plain `npm pack` tarball is rejected", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "chronicle-pack-test-"));
  try {
    writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({
        name: "pack-fixture",
        version: "1.0.0",
        dependencies: { "better-sqlite3": "catalog:" },
      }),
    );
    writeFileSync(path.join(dir, "index.js"), "");
    execFileSync("npm", ["pack", "--silent"], {
      cwd: dir,
      stdio: "ignore",
      shell: process.platform === "win32",
    });
    const tarball = readdirSync(dir).find((f) => f.endsWith(".tgz"));
    assert.ok(tarball, "npm pack produced a tarball");
    const manifest = readFileFromTarball(readFileSync(path.join(dir, tarball)), "package/package.json");
    assert.ok(manifest !== null, "package/package.json is in the tarball");
    assert.deepEqual(findUnpublishableSpecs(manifest), ['dependencies.better-sqlite3: "catalog:"']);
    assert.equal(readFileFromTarball(readFileSync(path.join(dir, tarball)), "package/nope.json"), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
