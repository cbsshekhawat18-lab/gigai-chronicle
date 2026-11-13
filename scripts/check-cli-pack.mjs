/**
 * Publish-shape gate for the `gigai-chronicle` CLI.
 *
 * gigai-chronicle@0.1.0–0.3.0 went out with `"better-sqlite3": "catalog:"`
 * in `dependencies` — they were published with a tool that does not rewrite
 * pnpm's `catalog:` / `workspace:` protocols, so `npm i -g gigai-chronicle`
 * died with EUNSUPPORTEDPROTOCOL for everyone. `pnpm pack` / `pnpm publish`
 * rewrite both protocols to real ranges; this script proves the tarball we
 * would publish is installable by plain npm:
 *
 *   1. `pnpm pack` the CLI (the same manifest rewrite `pnpm publish` uses);
 *   2. read package/package.json out of the tarball and fail on any
 *      `catalog:` / `workspace:` left in it;
 *   3. `npm i -g <tarball>` into a throwaway prefix and run
 *      `chronicle --version` from there — with a PATH that holds only that
 *      prefix and node, so a dev checkout's `chronicle` can't stand in.
 *
 * Usage:   node scripts/check-cli-pack.mjs          (after `pnpm build`)
 * Exit:    0 publishable · 1 not publishable
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI_DIR = path.join(REPO_ROOT, "apps", "cli");
const IS_WINDOWS = process.platform === "win32";

/** Manifest fields npm resolves at install time. */
const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

/** pnpm-only protocols plain npm cannot install. */
const PNPM_PROTOCOLS = ["catalog:", "workspace:"];

/**
 * Every `field.name: spec` in a packed manifest that npm can't resolve,
 * plus a raw-text sweep so a protocol hiding anywhere else (overrides,
 * bundled metadata) is caught too.
 * @param {string} manifestText raw package.json text from the tarball
 * @returns {string[]} human-readable problems; empty means publishable
 */
export function findUnpublishableSpecs(manifestText) {
  const problems = [];
  const manifest = JSON.parse(manifestText);
  for (const field of DEPENDENCY_FIELDS) {
    for (const [name, spec] of Object.entries(manifest[field] ?? {})) {
      if (typeof spec === "string" && PNPM_PROTOCOLS.some((p) => spec.startsWith(p))) {
        problems.push(`${field}.${name}: "${spec}"`);
      }
    }
  }
  if (problems.length === 0) {
    for (const protocol of PNPM_PROTOCOLS) {
      if (manifestText.includes(`"${protocol}`)) problems.push(`raw manifest contains "${protocol}"`);
    }
  }
  return problems;
}

/**
 * Read one file out of a .tgz without shelling out to `tar` (on the Windows
 * runner the `tar` on PATH can be GNU tar, which reads `C:` as a remote host).
 * @param {Buffer} tgz
 * @param {string} wanted e.g. "package/package.json"
 * @returns {string | null}
 */
export function readFileFromTarball(tgz, wanted) {
  const tar = gunzipSync(tgz);
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break; // end-of-archive marker
    const field = (start, length) =>
      header.subarray(start, start + length).toString("utf8").replace(/\0.*$/s, "");
    const name = field(0, 100);
    const prefix = field(345, 155); // ustar long-name prefix
    const fullName = prefix === "" ? name : `${prefix}/${name}`;
    const size = Number.parseInt(field(124, 12).trim() || "0", 8);
    const bodyStart = offset + 512;
    if (fullName === wanted) return tar.subarray(bodyStart, bodyStart + size).toString("utf8");
    offset = bodyStart + Math.ceil(size / 512) * 512;
  }
  return null;
}

function run(command, args, options = {}) {
  // pnpm/npm are .cmd shims on Windows, which spawn refuses without a shell.
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: IS_WINDOWS,
    ...options,
  });
}

function main() {
  const version = JSON.parse(readFileSync(path.join(CLI_DIR, "package.json"), "utf8")).version;
  if (!existsSync(path.join(CLI_DIR, "dist", "main.js"))) {
    console.error("check-cli-pack: apps/cli/dist/main.js is missing — run `pnpm build` first");
    return 1;
  }

  const scratch = mkdtempSync(path.join(tmpdir(), "chronicle-pack-"));
  try {
    // 1. Pack exactly what `pnpm publish` would upload.
    const packDir = path.join(scratch, "pack");
    run("pnpm", ["pack", "--pack-destination", packDir], { cwd: CLI_DIR });
    const tarballName = readdirSync(packDir).find((f) => f.endsWith(".tgz"));
    if (tarballName === undefined) {
      console.error("check-cli-pack: pnpm pack produced no tarball");
      return 1;
    }
    const tarball = path.join(packDir, tarballName);

    // 2. No pnpm-only protocol may survive into the published manifest.
    const manifestText = readFileFromTarball(readFileSync(tarball), "package/package.json");
    if (manifestText === null) {
      console.error(`check-cli-pack: ${tarballName} has no package/package.json`);
      return 1;
    }
    const problems = findUnpublishableSpecs(manifestText);
    if (problems.length > 0) {
      console.error(`check-cli-pack: ${tarballName} is not installable with npm:`);
      for (const problem of problems) console.error(`  ✗ ${problem}`);
      return 1;
    }
    console.log(`✓ ${tarballName}: no catalog:/workspace: in the packed package.json`);

    // 3. Install it the way a user does, into a prefix nothing else uses.
    const prefix = path.join(scratch, "prefix");
    run("npm", ["install", "--global", "--prefix", prefix, "--no-audit", "--no-fund", tarball]);
    const binDir = IS_WINDOWS ? prefix : path.join(prefix, "bin");
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (key.toUpperCase() === "PATH") delete env[key];
    // Only the fresh prefix and node itself (the bin's shebang needs `node`).
    env.PATH = [binDir, path.dirname(process.execPath)].join(path.delimiter);
    const result = spawnSync("chronicle", ["--version"], {
      encoding: "utf8",
      env,
      cwd: scratch,
      shell: IS_WINDOWS,
    });
    const printed = (result.stdout ?? "").trim();
    if (result.status !== 0 || printed !== version) {
      console.error(
        `check-cli-pack: \`chronicle --version\` from the installed tarball failed ` +
          `(exit ${result.status}, printed "${printed}", expected "${version}")\n${result.stderr ?? ""}`,
      );
      return 1;
    }
    console.log(`✓ npm i -g ${tarballName} && chronicle --version → ${printed}`);
    return 0;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
