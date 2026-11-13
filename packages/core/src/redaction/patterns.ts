/**
 * Secret pattern pack — seeded in M4 for `chronicle doctor --scan-secrets`;
 * M5's Event Engine redaction stage extends and consumes the same pack
 * (§9 stage 2, §18). Data-driven: one entry per token class, so updating is
 * a small reviewable PR with corpus tests.
 *
 * Patterns match the token FORMATS. Scanner output must never include the
 * matched secret itself — kind + location only.
 *
 * Two shapes of entry:
 *  - whole-token: the entire match is the credential (`AKIA…`, `ghp_…`);
 *  - contextual: the regex defines named groups `pre`, `secret`, `post`
 *    (match === pre + secret + post) and only `secret` is redacted, so the
 *    surrounding text stays readable — `postgres://app:[REDACTED…]@db/prod`,
 *    `DB_PASSWORD=[REDACTED…]`.
 * An optional `accept` makes a check a regex can't express (key-name words).
 *
 * Order matters: specific token formats come first so a key that is also
 * assigned (`OPENAI_API_KEY=sk-proj-…`) gets its precise kind; the generic
 * assignment patterns run last and skip values that are already markers.
 */

export interface SecretPattern {
  readonly kind: string;
  readonly pattern: RegExp;
  /** Extra acceptance test over the match's named groups. */
  readonly accept?: (groups: Readonly<Record<string, string | undefined>>) => boolean;
}

/** Prefix of every redaction marker — a match inside one is never re-flagged. */
export const MARKER_PREFIX = "[REDACTED:";

// ---- credential-assignment key names -------------------------------------
//
// The key must match /(pass(word)?|passwd|secret|token|api[_-]?key|private[_-]?key|auth)/i
// AS A WORD of the identifier — `DB_PASSWORD`, `apiKey`, `client_secret`,
// `authToken`, `Authorization` — never as a mere substring. Substring matching
// would destroy `"author": "…"` (every package.json), `max_tokens=4096`,
// `tokenizer`, `authority`. Redaction is irreversible, so this errs narrow.

const KEY_WORDS = new Set([
  "pass", "password", "passwd", "secret", "token", "auth", "authorization",
  "apikey", "privatekey",
]);
const KEY_PAIRS = new Set(["api key", "private key"]);
/**
 * Unseparated env-style names (`PGPASSWORD`, `GITHUBTOKEN`) end in a key
 * word. Only the unambiguous words count as suffixes — `pass` and `auth`
 * would turn `compass`, `bypass`, `oauth` into credentials.
 */
const KEY_SUFFIXES = ["password", "passwd", "secret", "token", "apikey", "privatekey"];
/**
 * A trailing word that makes the key ABOUT a credential rather than one:
 * `token_type`, `TOKEN_URL`, `password_file`, `auth_method`, `secret_name`.
 */
const METADATA_TAIL = new Set([
  "type", "url", "uri", "endpoint", "host", "name", "id", "file", "path", "dir",
  "count", "length", "len", "size", "ttl", "expiry", "expires", "expiration",
  "limit", "header", "prefix", "policy", "hint", "label", "field", "env", "var",
  "mode", "kind", "format", "provider", "method", "required", "enabled",
]);

/** Split an identifier into lowercase words: `DB_PASSWORD`, `apiKey`, `x-api-key`. */
function keyWords(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w !== "");
}

/** True when an identifier names a credential (see KEY_WORDS above). */
export function isCredentialKeyName(key: string): boolean {
  const words = keyWords(key);
  if (words.length === 0) return false;
  if (METADATA_TAIL.has(words[words.length - 1] as string)) return false;
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i] as string;
    if (KEY_WORDS.has(word) || KEY_SUFFIXES.some((suffix) => word.endsWith(suffix))) return true;
    if (i + 1 < words.length && KEY_PAIRS.has(`${words[i]} ${words[i + 1]}`)) return true;
  }
  return false;
}

/**
 * Values that are not secrets even under a credential key: empties and
 * flags, numbers, placeholders, masks, and references to where the real
 * secret lives (`${VAR}`, `process.env.X`, `<your-key>`).
 */
function isPlausibleSecretValue(value: string): boolean {
  const v = value.trim();
  if (v.length < 4) return false;
  if (/^(?:true|false|null|none|nil|undefined|empty|changeme|redacted|required|optional|string|secret|password|token)$/i.test(v)) return false;
  if (/^\d+(?:\.\d+)?$/.test(v)) return false; // max_tokens=4096
  if (/^(.)\1+$/.test(v)) return false; // ****, xxxx
  if (/^(?:\$\{?|%|\{\{|<|process\.env\b|os\.environ\b|env\(|getenv\()/i.test(v)) return false;
  if (/^[A-Za-z_$][\w$.]*\(/.test(v)) return false; // a call: getToken()
  return true;
}

const acceptAssignment = (groups: Readonly<Record<string, string | undefined>>): boolean =>
  isCredentialKeyName((groups["key"] ?? "").replace(/^["']|["']$/g, "")) &&
  isPlausibleSecretValue(groups["secret"] ?? "");

export const SECRET_PATTERNS: readonly SecretPattern[] = [
  { kind: "aws-access-key-id", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { kind: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/ },
  { kind: "github-fine-grained-pat", pattern: /\bgithub_pat_[A-Za-z0-9_]{22,255}/ },
  { kind: "gitlab-pat", pattern: /\bglpat-[A-Za-z0-9_-]{20,}/ },
  { kind: "slack-token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { kind: "google-api-key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { kind: "anthropic-api-key", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { kind: "openai-api-key", pattern: /\bsk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{20,}/ },
  { kind: "openai-api-key", pattern: /\bsk-[A-Za-z0-9]{48}\b/ }, // legacy format
  { kind: "stripe-live-key", pattern: /\b[rs]k_live_[0-9A-Za-z]{24,}\b/ },
  { kind: "npm-token", pattern: /\bnpm_[A-Za-z0-9]{36}\b/ },
  { kind: "huggingface-token", pattern: /\bhf_[A-Za-z0-9]{30,}\b/ },
  { kind: "xai-api-key", pattern: /\bxai-[A-Za-z0-9]{32,}\b/ },
  { kind: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { kind: "private-key-block", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  {
    // A secret access key is 40 base64-ish chars with no prefix — only
    // recognizable next to its name (~/.aws/credentials, env, JSON).
    kind: "aws-secret-access-key",
    pattern:
      /(?<pre>\baws_?secret_?access_?key["']?\s*[:=]\s*["']?)(?<secret>[A-Za-z0-9/+]{40})(?<post>)(?![A-Za-z0-9/+=])/i,
  },
  {
    // scheme://user:PASSWORD@host — only the password goes; the URL stays
    // readable (which database, which host, which user).
    kind: "url-credential",
    pattern:
      /(?<pre>\b[A-Za-z][A-Za-z0-9+.-]{1,31}:\/\/[^\s:@/?#'"]{1,128}:)(?<secret>[^\s@/?#'"]{1,256})(?<post>@)/,
  },
  {
    // "password": "x" · password = "x" · apiKey: 'x' (quoted value)
    kind: "credential-assignment",
    pattern:
      /(?<pre>(?<![\w.-])(?<key>["']?[A-Za-z_][\w.-]{0,63}["']?)\s*[:=]\s*(?<q>["']))(?<secret>(?:(?!\k<q>)[^\n\\]){1,512})(?<post>\k<q>)/,
    accept: acceptAssignment,
  },
  {
    // DB_PASSWORD=x · --api-key=x · ?token=x (unquoted, no spaces around =)
    kind: "credential-assignment",
    pattern:
      /(?<pre>(?<![\w.-])-{0,2}(?<key>[A-Za-z_][\w.-]{0,63})=)(?![=>"'])(?<secret>[^\s"'`&;,]{1,512})(?<post>)/,
    accept: acceptAssignment,
  },
];

/** One accepted match of a pattern in a text. */
export interface SecretMatch {
  readonly kind: string;
  /** The whole regex match. */
  readonly match: string;
  /** The credential itself (the `secret` group, or the whole match). */
  readonly secret: string;
  /** Context kept verbatim around the secret (empty for whole-token kinds). */
  readonly pre: string;
  readonly post: string;
}

function globalOf(pattern: RegExp): RegExp {
  return new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
}

function toMatch(entry: SecretPattern, match: string, groups: Record<string, string | undefined> | undefined): SecretMatch | null {
  const g = groups ?? {};
  const secret = g["secret"] ?? match;
  if (secret === "" || secret.includes(MARKER_PREFIX)) return null; // already redacted
  if (entry.accept !== undefined && !entry.accept(g)) return null;
  return g["secret"] === undefined
    ? { kind: entry.kind, match, secret: match, pre: "", post: "" }
    : { kind: entry.kind, match, secret, pre: g["pre"] ?? "", post: g["post"] ?? "" };
}

/**
 * Rewrite every accepted match of one pattern: `rewrite(secret)` replaces
 * the credential, `pre`/`post` context is kept byte-for-byte.
 */
export function replaceSecrets(
  text: string,
  entry: SecretPattern,
  rewrite: (secret: string, kind: string) => string,
): string {
  return text.replace(globalOf(entry.pattern), (...args: unknown[]) => {
    const match = args[0] as string;
    const last = args[args.length - 1];
    const groups = typeof last === "object" && last !== null ? (last as Record<string, string | undefined>) : undefined;
    const found = toMatch(entry, match, groups);
    return found === null ? match : `${found.pre}${rewrite(found.secret, found.kind)}${found.post}`;
  });
}

/** Every accepted match of the whole pack (for audits; never logged). */
export function findSecrets(text: string): SecretMatch[] {
  const found: SecretMatch[] = [];
  for (const entry of SECRET_PATTERNS) {
    for (const m of text.matchAll(globalOf(entry.pattern))) {
      const hit = toMatch(entry, m[0], m.groups);
      if (hit !== null) found.push(hit);
    }
  }
  return found;
}

/** Kinds of secrets present in `text` (never the matches themselves). */
export function detectSecretKinds(text: string): string[] {
  return [...new Set(findSecrets(text).map((m) => m.kind))];
}
