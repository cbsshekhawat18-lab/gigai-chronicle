/**
 * Repository fingerprint — ADR-0009, byte-exact Spec v1 surface.
 */
import { createHash } from "node:crypto";
import { isShallowRepository, remoteFetchUrls, rootCommits } from "../git/git-info.js";

export interface RepositoryFingerprint {
  /** Sorted full root-commit SHAs; empty when shallow or unborn. */
  roots: string[];
  /** Sorted normalized remote fetch URLs. */
  remotes: string[];
  /** sha256 hex of the canonical serialization; null when both sets empty. */
  digest: string | null;
  shallow: boolean;
}

/** Normalization rules table from ADR-0009, applied in order. */
export function normalizeRemoteUrl(url: string): string {
  let out = url.trim();

  const scpLike = /^(?:[^@/\s]+@)([^:/\s]+):(?!\/)(.+)$/.exec(out);
  const urlLike = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/\s]+@)?([^/\s]+)(\/.*)?$/i.exec(out);
  if (scpLike !== null) {
    out = `${(scpLike[1] as string).toLowerCase()}/${scpLike[2] as string}`;
  } else if (urlLike !== null) {
    out = `${(urlLike[1] as string).toLowerCase()}${(urlLike[2] as string | undefined) ?? ""}`;
  } else {
    return out; // local paths / bundles pass through unchanged
  }

  out = out.replace(/\/+$/, "");
  out = out.replace(/\.git$/, "");
  out = out.replace(/\/+$/, "");
  return out;
}

/** Canonical serialization + digest (ADR-0009). */
export function digestFingerprint(roots: readonly string[], remotes: readonly string[]): string | null {
  if (roots.length === 0 && remotes.length === 0) return null;
  const canonical = [
    "chronicle-repo-fingerprint/1",
    "roots",
    ...roots,
    "remotes",
    ...remotes,
    "", // trailing newline
  ].join("\n");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export async function computeRepositoryFingerprint(
  repoRoot: string,
): Promise<RepositoryFingerprint> {
  const shallow = await isShallowRepository(repoRoot);
  const roots = shallow ? [] : (await rootCommits(repoRoot)).sort();
  const remotes = (await remoteFetchUrls(repoRoot)).map(normalizeRemoteUrl).sort();
  return { roots, remotes, digest: digestFingerprint(roots, remotes), shallow };
}

/**
 * Foreign-repo check (ADR-0009): compares ROOTS, never digests — the remote
 * component legitimately drifts. Foreign iff both root sets are non-empty
 * and disjoint.
 */
export function isForeignRepository(
  recordedRoots: readonly string[],
  currentRoots: readonly string[],
): boolean {
  if (recordedRoots.length === 0 || currentRoots.length === 0) return false;
  const current = new Set(currentRoots);
  return !recordedRoots.some((root) => current.has(root));
}
