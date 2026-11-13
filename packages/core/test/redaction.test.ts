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
  // Provider key prefixes. Built from pieces so no token-shaped literal sits
  // in the source (push protection / scanners must not see a "real" key).
  { kind: "anthropic-api-key", sample: `sk-ant-api03-${"aB3_x-Q9".repeat(12)}` },
  { kind: "openai-api-key", sample: `sk-proj-${"Zq8Lw2Nf".repeat(10)}` },
  { kind: "openai-api-key", sample: `sk-${"Tm4Rk7Pc".repeat(6)}` }, // legacy: exactly 48
  { kind: "stripe-live-key", sample: `sk_${"live"}_${"4eC39HqLyjWDarjtT1zdp7dc".repeat(2)}` },
  { kind: "stripe-live-key", sample: `rk_${"live"}_${"51HxYz0aBcDeFgHiJkLmNoPq"}` },
  { kind: "github-fine-grained-pat", sample: `github_pat_${"11ABCDEFG0".repeat(3)}_${"aBcD3fGh1j".repeat(6)}` },
  { kind: "gitlab-pat", sample: `glpat-${"xY7_zQ2-Lm".repeat(2)}` },
  { kind: "npm-token", sample: `npm_${"Rk2Lp9Qx".repeat(4)}Ab12` }, // 36 after npm_
  { kind: "huggingface-token", sample: `hf_${"KqWzPmLnRt".repeat(3)}Ab12` },
  { kind: "xai-api-key", sample: `xai-${"Gh5Jk8Lm2Np4".repeat(6)}` },
];

/**
 * Contextual classes: only the secret part goes, the context stays readable.
 * `expected` is the text with the secret replaced by its marker.
 */
const CONTEXT_CORPUS: Array<{ kind: string; secret: string; text: (s: string) => string }> = [
  // credentials in URLs — keep scheme, user, host, path
  { kind: "url-credential", secret: "hunter2-db", text: (s) => `psql postgres://app:${s}@db.internal:5432/prod` },
  { kind: "url-credential", secret: "p%4055w0rd", text: (s) => `git clone https://deploy:${s}@git.example.com/org/repo.git` },
  { kind: "url-credential", secret: "guest123", text: (s) => `AMQP_URL=amqp://guest:${s}@rabbit/vhost` },
  // KEY=value (unquoted, env/flag/query style)
  { kind: "credential-assignment", secret: "s3cr3t-Value_42", text: (s) => `DB_PASSWORD=${s}` },
  { kind: "credential-assignment", secret: "hunter2!", text: (s) => `export PGPASSWORD=${s} && psql` },
  { kind: "credential-assignment", secret: "abc123xyz", text: (s) => `mytool --api-key=${s} --verbose` },
  { kind: "credential-assignment", secret: "e1f2a3b4c5", text: (s) => `GET /hook?token=${s}&page=2` },
  { kind: "credential-assignment", secret: "tok-live-9f8e", text: (s) => `GITHUB_TOKEN=${s}` },
  { kind: "credential-assignment", secret: "Z9yX8wV7u", text: (s) => `client_secret=${s}` },
  { kind: "credential-assignment", secret: "s3cr3t", text: (s) => `MYSQL_PASSWD=${s}` },
  // "key": "value" / key = "value" / key: 'value' (quoted)
  { kind: "credential-assignment", secret: "correct horse battery", text: (s) => `{"password": "${s}", "user": "ann"}` },
  { kind: "credential-assignment", secret: "k-12345abcde", text: (s) => `const config = { apiKey: '${s}' };` },
  { kind: "credential-assignment", secret: "Bearer abc.def.ghi", text: (s) => `headers: {"Authorization": "${s}"}` },
  { kind: "credential-assignment", secret: "pk_9f8e7d6c", text: (s) => `private_key = "${s}"` },
  { kind: "credential-assignment", secret: "q1w2e3r4", text: (s) => `auth: "${s}"` },
  { kind: "credential-assignment", secret: "zz-top-secret", text: (s) => `SECRET_KEY = '${s}'` },
  // AWS secret access key, recognized by its neighbour
  {
    kind: "aws-secret-access-key",
    secret: `wJalrXUtnFEMI/K7MDENG/${"bPxRfiCYEXAMPLEKEY".slice(0, 18)}`,
    text: (s) => `[default]\naws_secret_access_key = ${s}\nregion = us-east-1`,
  },
  {
    kind: "aws-secret-access-key",
    secret: `wJalrXUtnFEMI/K7MDENG/${"bPxRfiCYEXAMPLEKEY".slice(0, 18)}`,
    text: (s) => `AWS_SECRET_ACCESS_KEY="${s}"`,
  },
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
  // Credential-ish words that are NOT credentials (substring ≠ key word).
  '{ "name": "gigai-chronicle", "author": "Gigai Kripa Services", "license": "MIT" }',
  "set max_tokens=4096 and temperature=0.2",
  'const tokenizer = "cl100k_base"; const authority = "https://login.example.com";',
  // Credential keys whose value is not a secret: references, placeholders,
  // flags, numbers, masks, calls, and keys ABOUT a credential.
  "DB_PASSWORD=${DB_PASSWORD} docker compose up",
  'password = os.environ["DB_PASSWORD"]',
  "apiKey: process.env.API_KEY,",
  'export API_KEY=<your-api-key>',
  '{"password": "", "token": null, "auth": true, "secret": "****"}',
  "token = getToken(); if (token===undefined) return;",
  "TOKEN_TTL=3600 TOKEN_URL=https://auth.example.com/oauth/token",
  '{"token_type": "Bearer", "auth_method": "oidc", "password_file": "/run/secrets/db"}',
  // URLs with a user but no password, ports, scp-style remotes.
  "git clone git@github.com:org/repo.git && open https://user@example.com:8443/path",
  "curl http://localhost:3000/api/users?page=2&sort=asc",
  // Prose that mentions the prefixes without being a key.
  "the task-ant-colony solver uses sk-learn and hf_hub_download; npm_config_cache is set",
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

describe("redaction — contextual corpus (only the secret goes; context stays readable)", () => {
  const redactor = createRedactor();
  for (const { kind, secret, text } of CONTEXT_CORPUS) {
    const input = text(secret);
    it(`${kind}: ${input.replace(secret, "…").slice(0, 60)}`, () => {
      const out = redactor.redactText(input);
      // Exactly the secret is replaced — every other byte survives.
      expect(out).toBe(input.replace(secret, marker(kind, secret)));
      expect(out).not.toContain(secret);
    });
  }

  it("a key-prefixed token assigned to a key keeps its precise kind (no double marker)", () => {
    const key = `sk-proj-${"Zq8Lw2Nf".repeat(10)}`;
    const out = redactor.redactText(`OPENAI_API_KEY=${key}`);
    expect(out).toBe(`OPENAI_API_KEY=${marker("openai-api-key", key)}`);
  });

  it("text that was already redacted is stable: redacting twice changes nothing", () => {
    for (const { secret, text } of CONTEXT_CORPUS) {
      const once = redactor.redactText(text(secret));
      expect(redactor.redactText(once)).toBe(once);
    }
  });
});

describe("secret detection (doctor --scan-secrets, memory verify)", () => {
  it("detects every new class by kind, never returning the secret", async () => {
    const { detectSecretKinds, findSecrets } = await import("../src/index.js");
    for (const { kind, sample } of CATCH_CORPUS) {
      expect(detectSecretKinds(`x ${sample} y`)).toContain(kind);
    }
    for (const { kind, secret, text } of CONTEXT_CORPUS) {
      expect(detectSecretKinds(text(secret))).toContain(kind);
      expect(findSecrets(text(secret)).find((m) => m.kind === kind)?.secret).toBe(secret);
    }
  });

  it("already-redacted text is clean — markers are never reported as findings", async () => {
    const { detectSecretKinds } = await import("../src/index.js");
    const redactor = createRedactor();
    for (const { secret, text } of CONTEXT_CORPUS) {
      expect(detectSecretKinds(redactor.redactText(text(secret)))).toEqual([]);
    }
  });

  it("key names count only as whole words", async () => {
    const { isCredentialKeyName } = await import("../src/index.js");
    for (const key of ["password", "DB_PASSWORD", "passwd", "apiKey", "API_KEY", "x-api-key", "APIKey",
      "client_secret", "authToken", "Authorization", "privateKey", "PRIVATE_KEY", "GITHUB_TOKEN", "pass",
      "PGPASSWORD", "csrftoken"]) {
      expect(isCredentialKeyName(key), key).toBe(true);
    }
    for (const key of ["author", "authors", "max_tokens", "tokenizer", "authority", "passenger", "compass", "bypass", "oauth",
      "token_type", "TOKEN_URL", "password_file", "secret_name", "keyboard", "apiVersion"]) {
      expect(isCredentialKeyName(key), key).toBe(false);
    }
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
