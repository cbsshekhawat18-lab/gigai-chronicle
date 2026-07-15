/**
 * The opt-in `prepare-commit-msg` trailer hook — the single exception to
 * read-git-never-write (design law 9, ADR-0002). Pure POSIX shell reading
 * the engine-maintained `.local/active-session` marker: ~1ms, fail-open,
 * no Node spawn. Etiquette (§11): chain — never clobber — via a marked
 * block; uninstall removes exactly ours; honors `core.hooksPath` (husky,
 * lefthook).
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const BEGIN = "# >>> chronicle prepare-commit-msg (BEGIN)";
const END = "# <<< chronicle prepare-commit-msg (END)";

const BLOCK = `${BEGIN}
# Appends "Chronicle-Session:" when a capture session is active. Fail-open:
# nothing here may ever block a commit. Installed by \`chronicle hooks
# install git\`; removed by \`chronicle hooks uninstall git\`.
if [ -f ".chronicle/.local/active-session" ]; then
  _chronicle_ses=$(cat ".chronicle/.local/active-session" 2>/dev/null | tr -d "[:space:]")
  if [ -n "$_chronicle_ses" ]; then
    git interpret-trailers --in-place --if-exists doNothing \\
      --trailer "Chronicle-Session: $_chronicle_ses" "$1" 2>/dev/null || true
  fi
fi
${END}`;

/** Hooks directory, honoring core.hooksPath (husky/lefthook setups). */
export function hooksDirFor(repoRoot: string): string {
  try {
    const configured = execFileSync("git", ["-C", repoRoot, "config", "core.hooksPath"], {
      encoding: "utf8",
    }).trim();
    if (configured !== "") {
      return path.isAbsolute(configured) ? configured : path.join(repoRoot, configured);
    }
  } catch {
    // not configured — default location
  }
  return path.join(repoRoot, ".git", "hooks");
}

/** Install (or no-op if present). Returns true when the hook file changed. */
export function installTrailerHook(repoRoot: string): boolean {
  const dir = hooksDirFor(repoRoot);
  const file = path.join(dir, "prepare-commit-msg");
  mkdirSync(dir, { recursive: true });

  if (!existsSync(file)) {
    writeFileSync(file, `#!/bin/sh\n${BLOCK}\n`, "utf8");
    chmodSync(file, 0o755);
    return true;
  }
  const existing = readFileSync(file, "utf8");
  if (existing.includes(BEGIN)) return false; // already installed
  // Chain: append our marked block; the existing hook runs first, untouched.
  const glue = existing.endsWith("\n") ? "" : "\n";
  writeFileSync(file, `${existing}${glue}${BLOCK}\n`, "utf8");
  chmodSync(file, 0o755);
  return true;
}

/** Remove exactly our block; delete the file only if we created all of it. */
export function uninstallTrailerHook(repoRoot: string): boolean {
  const file = path.join(hooksDirFor(repoRoot), "prepare-commit-msg");
  if (!existsSync(file)) return false;
  const existing = readFileSync(file, "utf8");
  const begin = existing.indexOf(BEGIN);
  if (begin === -1) return false;
  const end = existing.indexOf(END);
  const after = end === -1 ? "" : existing.slice(end + END.length).replace(/^\n/, "");
  const before = existing.slice(0, begin).replace(/\n$/, "\n");
  const remaining = (before + after).trim();
  if (remaining === "#!/bin/sh" || remaining === "") {
    writeFileSync(file, "", "utf8"); // file was entirely ours — leave it inert
  } else {
    writeFileSync(file, before + after, "utf8");
  }
  return true;
}
