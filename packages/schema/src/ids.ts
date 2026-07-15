/**
 * Chronicle IDs: prefixed ULIDs (ARCHITECTURE.md §5.2).
 *
 * ULIDs are lexicographically time-sortable and need no coordination — two
 * machines can generate IDs offline forever without collision. Chronicle IDs
 * carry a type prefix (`evt_`, `ses_`, …) so any ID is self-describing in
 * logs, URLs, and grep output.
 *
 * Implemented in-package (Crockford base32, 48-bit timestamp + 80-bit
 * randomness per the ULID spec) because this package allows no runtime
 * dependency beyond zod. Ordering within the same millisecond is not
 * guaranteed (non-monotonic factory); event ordering inside a session file
 * comes from append order, not ID comparison.
 *
 * Uses `globalThis.crypto` (WebCrypto) — available in Node >= 20 and
 * browsers — so this module stays platform-neutral.
 */

/** Crockford base32 alphabet (no I, L, O, U). */
const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TIME_LENGTH = 10; // 48 bits
const RANDOM_LENGTH = 16; // 80 bits
const MAX_TIME = 2 ** 48 - 1;

export const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** Entity-type prefixes (ARCHITECTURE.md §5.2). */
export const ID_PREFIXES = {
  event: "evt",
  session: "ses",
  project: "prj",
  workspace: "wks",
  prompt: "prm",
  decision: "dec",
  requirement: "req",
  benchmark: "bmk",
} as const;

export type IdKind = keyof typeof ID_PREFIXES;
export type IdPrefix = (typeof ID_PREFIXES)[IdKind];

export type ChronicleId<P extends IdPrefix = IdPrefix> = `${P}_${string}`;
export type EventId = ChronicleId<"evt">;
export type SessionId = ChronicleId<"ses">;
export type ProjectId = ChronicleId<"prj">;
export type WorkspaceId = ChronicleId<"wks">;

/** Random source signature — injectable for deterministic tests. */
export type RandomByteSource = (length: number) => Uint8Array;

const defaultRandomBytes: RandomByteSource = (length) =>
  globalThis.crypto.getRandomValues(new Uint8Array(length));

function encodeTime(time: number): string {
  if (!Number.isInteger(time) || time < 0 || time > MAX_TIME) {
    throw new RangeError(`ulid time out of range: ${time}`);
  }
  let remaining = time;
  let out = "";
  for (let i = 0; i < TIME_LENGTH; i++) {
    out = ENCODING[remaining % 32] + out;
    remaining = Math.floor(remaining / 32);
  }
  return out;
}

function encodeRandom(randomBytes: RandomByteSource): string {
  const bytes = randomBytes(RANDOM_LENGTH);
  if (bytes.length !== RANDOM_LENGTH) {
    throw new RangeError(`random source must yield ${RANDOM_LENGTH} bytes`);
  }
  let out = "";
  // byte & 31 is uniform (256 = 8 × 32), so no modulo bias.
  for (let i = 0; i < RANDOM_LENGTH; i++) out += ENCODING[(bytes[i] as number) & 31];
  return out;
}

/** Generate a bare ULID. `time`/`randomBytes` are injectable for tests. */
export function generateUlid(time: number = Date.now(), randomBytes = defaultRandomBytes): string {
  return encodeTime(time) + encodeRandom(randomBytes);
}

/** Generate a prefixed Chronicle ID, e.g. `newId("event")` → `evt_01J…`. */
export function newId<K extends IdKind>(
  kind: K,
  time?: number,
  randomBytes?: RandomByteSource,
): ChronicleId<(typeof ID_PREFIXES)[K]> {
  return `${ID_PREFIXES[kind]}_${generateUlid(time, randomBytes)}` as ChronicleId<
    (typeof ID_PREFIXES)[K]
  >;
}

/** True if `value` is a well-formed Chronicle ID of the given kind. */
export function isId<K extends IdKind>(
  value: unknown,
  kind: K,
): value is ChronicleId<(typeof ID_PREFIXES)[K]> {
  if (typeof value !== "string") return false;
  const prefix = `${ID_PREFIXES[kind]}_`;
  return value.startsWith(prefix) && ULID_REGEX.test(value.slice(prefix.length));
}

/** Regex source for a prefixed ID — reused by zod schemas and JSON Schemas. */
export function idPattern(kind: IdKind): string {
  return `^${ID_PREFIXES[kind]}_[0-9A-HJKMNP-TV-Z]{26}$`;
}

/** Extract the millisecond timestamp encoded in a Chronicle ID or bare ULID. */
export function idTime(value: string): number {
  const ulid = value.includes("_") ? value.slice(value.indexOf("_") + 1) : value;
  if (!ULID_REGEX.test(ulid)) throw new TypeError(`not a ULID: ${value}`);
  let time = 0;
  for (let i = 0; i < TIME_LENGTH; i++) {
    time = time * 32 + ENCODING.indexOf(ulid[i] as string);
  }
  return time;
}
