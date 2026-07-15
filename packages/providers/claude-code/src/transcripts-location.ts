/**
 * Where Claude Code keeps transcripts: `~/.claude/projects/<cwd-slug>/…jsonl`
 * (CAPTURE-SURFACES.md §2.2). The slug replaces every non-alphanumeric
 * character of the absolute workspace path with `-`. Undocumented format —
 * treat as churn-prone; discovery is best-effort by design.
 */
import { homedir } from "node:os";
import path from "node:path";

export function cwdSlug(absolutePath: string): string {
  return absolutePath.replace(/[^A-Za-z0-9]/g, "-");
}

export function transcriptsRoot(home: string = homedir()): string {
  return path.join(home, ".claude", "projects");
}

/** Candidate transcript directories for a set of known workspace paths. */
export function transcriptDirsFor(
  knownWorkspacePaths: readonly string[],
  root: string = transcriptsRoot(),
): string[] {
  const dirs = new Set<string>();
  for (const workspacePath of knownWorkspacePaths) {
    dirs.add(path.join(root, cwdSlug(path.resolve(workspacePath))));
  }
  return [...dirs];
}
