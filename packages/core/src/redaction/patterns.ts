/**
 * Secret pattern pack — seeded in M4 for `chronicle doctor --scan-secrets`;
 * M5's Event Engine redaction stage extends and consumes the same pack
 * (§9 stage 2, §18). Data-driven: one entry per token class, so updating is
 * a small reviewable PR with corpus tests.
 *
 * Patterns match the token FORMATS. Scanner output must never include the
 * matched secret itself — kind + location only.
 */

export interface SecretPattern {
  readonly kind: string;
  readonly pattern: RegExp;
}

export const SECRET_PATTERNS: readonly SecretPattern[] = [
  { kind: "aws-access-key-id", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { kind: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/ },
  { kind: "slack-token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { kind: "google-api-key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { kind: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { kind: "private-key-block", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

/** Kinds of secrets present in `text` (never the matches themselves). */
export function detectSecretKinds(text: string): string[] {
  return SECRET_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ kind }) => kind);
}
