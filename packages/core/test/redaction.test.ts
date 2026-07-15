/**
 * Redaction corpus — both directions matter equally (M5 epic risk #1):
 * every seeded token class must be caught, and plain developer content must
 * pass through byte-for-byte (redaction is irreversible; a false positive
 * destroys user content).
 *
 * All "secrets" here are SYNTHETIC (SECURITY.md fixture policy).
 */
import { describe, expect, it } from "vitest";
import { newId } from "@gigaichronicle/schema";
import { createRedactor, marker } from "../src/index.js";

/** One synthetic sample per pattern-pack kind. */
const CATCH_CORPUS: Array<{ kind: string; sample: string }> = [
  { kind: "aws-access-key-id", sample: "AKIAIOSFODNN7EXAMPLE" },
  { kind: "github-token", sample: `ghp_${"Ab1".repeat(12)}` }, // 36 chars
  { kind: "slack-token", sample: "xoxb-1234567890-abcdefghijk" },
  { kind: "google-api-key", sample: `AIza${"Sy0-D".repeat(7)}` }, // 35 after AIza
  {
    kind: "jwt",
    sample: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5c",
  },
  { kind: "private-key-block", sample: "-----BEGIN RSA PRIVATE KEY-----" },
];

const FALSE_POSITIVE_CORPUS: string[] = [
  "Add refresh-token rotation to the auth middleware and revoke the family on reuse.",
  "The function refreshAccessTokenWithRetry handles exponential backoff correctly.",
  `see event ${newId("event")} in session ${newId("session")}`,
  "commit 9fc1b2a4d8e02b1c7a6f5e4d3c2b1a0918273645 fixed it",
  "sha256-e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "https://github.com/example/repo/pull/1234?tab=files#diff-abc123",
  "Deployed 2026-07-14T10:32:11.412Z to /usr/local/var/www/releases/current",
  "const MAX_CANDIDATE_BYTES = 1024 * 1024; // one mebibyte",
];

describe("redaction — catch corpus", () => {
  const redactor = createRedactor();

  for (const { kind, sample } of CATCH_CORPUS) {
    it(`catches ${kind}`, () => {
      const text = `before ${sample} after`;
      const out = redactor.redactText(text);
      expect(out).not.toContain(sample);
      expect(out).toContain(`[REDACTED:${kind}:`);
    });
  }

  it("catches free-standing high-entropy credentials", () => {
    const secret = "q7R2xK9mP4vL8nW3jT6yB1cD5fG0hZaS"; // 3 char classes, high entropy
    const out = redactor.redactText(`token: ${secret}`);
    expect(out).not.toContain(secret);
    expect(out).toContain("[REDACTED:high-entropy:");
  });

  it("markers are stable per secret and distinct across secrets", () => {
    const a = redactor.redactText("AKIAIOSFODNN7EXAMPLE");
    const b = redactor.redactText("AKIAIOSFODNN7EXAMPLE");
    const c = redactor.redactText("AKIAI44QH8DHBEXAMPLE");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toBe(marker("aws-access-key-id", "AKIAIOSFODNN7EXAMPLE"));
  });

  it("redacts every occurrence, everywhere in a deep payload", () => {
    const redactor2 = createRedactor();
    const out = redactor2.redactDeep({
      text: "key AKIAIOSFODNN7EXAMPLE",
      nested: { list: ["AKIAIOSFODNN7EXAMPLE", { deep: "x AKIAIOSFODNN7EXAMPLE y" }] },
      count: 3,
      flag: true,
    }) as Record<string, unknown>;
    expect(JSON.stringify(out)).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(out["count"]).toBe(3);
    expect(out["flag"]).toBe(true);
  });
});

describe("redaction — false-positive corpus (content must survive untouched)", () => {
  const redactor = createRedactor();
  for (const text of FALSE_POSITIVE_CORPUS) {
    it(`passes through: "${text.slice(0, 48)}…"`, () => {
      expect(redactor.redactText(text)).toBe(text);
    });
  }
});

describe("redaction — workspace env values", () => {
  it("redacts harvested values wherever they appear, by exact match", () => {
    const redactor = createRedactor(["s3cr3t-db-password!"]);
    const out = redactor.redactText("psql postgres://app:s3cr3t-db-password!@db:5432/prod");
    expect(out).not.toContain("s3cr3t-db-password!");
    expect(out).toContain("[REDACTED:workspace-env:");
  });

  it("overlapping env values redact longest-first, deterministically", () => {
    const long = "abcdefgh-ijklmnop";
    const short = "abcdefgh";
    const a = createRedactor([short, long]).redactText(`x ${long} y`);
    const b = createRedactor([long, short]).redactText(`x ${long} y`);
    expect(a).toBe(b);
    expect(a).not.toContain(long);
  });
});
