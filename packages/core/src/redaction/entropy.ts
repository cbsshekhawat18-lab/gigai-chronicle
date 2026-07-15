/**
 * Entropy heuristic — the safety net behind the pattern pack (§9 stage 2).
 *
 * Redaction is IRREVERSIBLE, so this is deliberately conservative: it only
 * flags tokens that look like machine-generated credentials (long, high
 * Shannon entropy, ≥3 character classes) and it explicitly excludes things
 * Chronicle itself produces or developers legitimately paste — IDs, hashes,
 * URLs, paths. The false-positive corpus test is as load-bearing as the
 * catch corpus (M5 epic risk #1).
 */

const MIN_LENGTH = 24;
const MIN_ENTROPY_BITS = 3.8;

/** Bits of Shannon entropy per character. */
export function shannonEntropy(value: string): number {
  if (value.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1);
  let bits = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

const CHRONICLE_ID = /^(?:evt|ses|prj|wks|prm|dec|req|bmk)_[0-9A-HJKMNP-TV-Z]{26}$/;
const PURE_HEX = /^(?:sha256-)?[0-9a-fA-F]+$/; // git shas, digests, blob refs
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/;

function characterClasses(token: string): number {
  let classes = 0;
  if (/[a-z]/.test(token)) classes += 1;
  if (/[A-Z]/.test(token)) classes += 1;
  if (/[0-9]/.test(token)) classes += 1;
  if (/[^A-Za-z0-9]/.test(token)) classes += 1;
  return classes;
}

/** True when a single whitespace-delimited token reads as a credential. */
export function looksLikeSecretToken(token: string): boolean {
  if (token.length < MIN_LENGTH) return false;
  // Things that are long and high-entropy but are NOT credentials:
  if (CHRONICLE_ID.test(token)) return false;
  if (PURE_HEX.test(token)) return false;
  if (ISO_TIMESTAMP.test(token)) return false;
  if (token.includes("://")) return false; // URLs
  if (token.startsWith("/") || token.startsWith("./") || token.startsWith("../")) return false; // paths
  return characterClasses(token) >= 3 && shannonEntropy(token) >= MIN_ENTROPY_BITS;
}

/**
 * High-entropy credential-looking tokens within free text. Token boundaries
 * are whitespace and quotes; edge punctuation is stripped.
 */
export function findEntropyTokens(text: string): string[] {
  const found: string[] = [];
  for (const raw of text.split(/[\s"'`]+/)) {
    const token = raw.replace(/^[([{<,;:]+|[)\]}>.,;:]+$/g, "");
    if (looksLikeSecretToken(token)) found.push(token);
  }
  return found;
}
