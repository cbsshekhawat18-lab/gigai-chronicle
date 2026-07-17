/**
 * Redaction stage (§9 stage 2): pattern pack + entropy heuristic + harvested
 * env values → irreversible `[REDACTED:kind:hash8]` markers, applied to
 * every string anywhere in a candidate payload BEFORE the first byte reaches
 * disk. The hash prefix makes markers stable (same secret → same marker) and
 * auditable without being reversible.
 */
import { createHash } from "node:crypto";
import { SECRET_PATTERNS } from "./patterns.js";
import { findEntropyTokens } from "./entropy.js";

export interface Redactor {
  /** Redact all strings in `value` (deep); returns the rewritten value. */
  redactDeep(value: unknown): unknown;
  /** Redact one string. */
  redactText(text: string): string;
}

function hash8(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex").slice(0, 8);
}

export function marker(kind: string, secret: string): string {
  return `[REDACTED:${kind}:${hash8(secret)}]`;
}

function escapeForRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** What `capture.redaction` in the config actually controls (ADR-0017). */
export interface RedactorOptions {
  /**
   * `capture.redaction.secrets` — the built-in pattern pack and the entropy
   * heuristic. Default true. Turning it off is a real need (an irreversible
   * false positive corrupts content), so it is honored rather than ignored.
   */
  secrets?: boolean;
  /**
   * `capture.redaction.customPatterns` — the user's own regex sources, for
   * secret shapes only they know (an org's internal token format). Applied
   * independently of `secrets`: listing a pattern IS the request to redact
   * it. An unparseable pattern is skipped, never thrown — capture must not
   * break on a config typo (law 8).
   */
  customPatterns?: readonly string[];
}

/** Compile user regex sources; drop the ones that don't compile. */
function compileCustom(sources: readonly string[]): Array<{ kind: string; pattern: RegExp }> {
  const compiled: Array<{ kind: string; pattern: RegExp }> = [];
  for (const source of sources) {
    try {
      compiled.push({ kind: "custom", pattern: new RegExp(source, "g") });
    } catch {
      // A typo in config must never stop capture. `doctor` is where an
      // unusable pattern gets surfaced; the engine's job is to keep going.
    }
  }
  return compiled;
}

/**
 * Build a redactor. `envValues` are workspace-secret literals (env-harvest);
 * they are held in process memory only for the lifetime of the engine and are
 * NOT config-controlled — they were found in the user's own environment, so
 * they are always redacted.
 */
export function createRedactor(
  envValues: readonly string[] = [],
  options: RedactorOptions = {},
): Redactor {
  // Longest-first so overlapping env values redact deterministically.
  const envLiterals = [...envValues].sort((a, b) => b.length - a.length);
  const useSecretPack = options.secrets !== false;
  const custom = compileCustom(options.customPatterns ?? []);

  function redactText(text: string): string {
    let out = text;
    for (const literal of envLiterals) {
      if (out.includes(literal)) {
        out = out.split(literal).join(marker("workspace-env", literal));
      }
    }
    // The user's own patterns run first and unconditionally: they named these
    // shapes precisely because the built-in pack cannot know them.
    for (const { kind, pattern } of custom) {
      out = out.replace(new RegExp(pattern.source, pattern.flags), (match) => marker(kind, match));
    }
    if (useSecretPack) {
      for (const { kind, pattern } of SECRET_PATTERNS) {
        const global = new RegExp(
          pattern.source,
          pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`,
        );
        out = out.replace(global, (match) => marker(kind, match));
      }
      for (const token of findEntropyTokens(out)) {
        // Markers from earlier passes are themselves high-entropy tokens (and
        // the tokenizer strips their surrounding brackets) — never re-flag.
        if (token.includes("REDACTED:")) continue;
        out = out.split(token).join(marker("high-entropy", token));
      }
    }
    return out;
  }

  function redactDeep(value: unknown): unknown {
    if (typeof value === "string") return redactText(value);
    if (Array.isArray(value)) return value.map(redactDeep);
    if (typeof value === "object" && value !== null) {
      const out: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
        out[key] = redactDeep(entry);
      }
      return out;
    }
    return value;
  }

  return { redactDeep, redactText };
}
