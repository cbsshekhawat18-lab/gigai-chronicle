/**
 * THE RED LINE (M5 DoD #1, risk R6): a secret reaching the store fails the
 * build. Every token class — plus a workspace .env value — is pushed through
 * the full engine pipeline, then the RAW stream files are grepped for the
 * plaintext. This test failing means stop everything.
 *
 * All secrets are synthetic (SECURITY.md).
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { newId } from "@gigaichronicle/schema";
import { EventEngine, fixedGitReader, runDoctor } from "../src/index.js";
import { WORKSPACE, makeTempChronicleDir } from "./helpers/events.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const SYNTHETIC_SECRETS = [
  "AKIAIOSFODNN7EXAMPLE",
  `ghp_${"Ab1".repeat(12)}`,
  "xoxb-1234567890-abcdefghijk",
  `AIza${"Sy0-D".repeat(7)}`,
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5c",
  "q7R2xK9mP4vL8nW3jT6yB1cD5fG0hZaS", // pure-entropy credential
  "env-file-secret-Va1ue!987654",     // arrives via .env harvest
  // Provider key prefixes (built from pieces — no token-shaped literals).
  `sk-ant-api03-${"aB3_x-Q9".repeat(12)}`,
  `sk-proj-${"Zq8Lw2Nf".repeat(10)}`,
  `sk-${"Tm4Rk7Pc".repeat(6)}`,
  `sk_${"live"}_${"4eC39HqLyjWDarjtT1zdp7dc".repeat(2)}`,
  `rk_${"live"}_${"51HxYz0aBcDeFgHiJkLmNoPq"}`,
  `github_pat_${"11ABCDEFG0".repeat(3)}_${"aBcD3fGh1j".repeat(6)}`,
  `glpat-${"xY7_zQ2-Lm".repeat(2)}`,
  `npm_${"Rk2Lp9Qx".repeat(4)}Ab12`,
  `hf_${"KqWzPmLnRt".repeat(3)}Ab12`,
  `xai-${"Gh5Jk8Lm2Np4".repeat(6)}`,
];

/**
 * Contextual classes: the secret only reads as one next to its context (a
 * URL's user:, a credential key, aws_secret_access_key). Low-entropy on
 * purpose — the entropy net must NOT be what catches these.
 */
const CONTEXTUAL: Array<{ secret: string; text: string }> = [
  { secret: "hunter2-db", text: "postgres://app:hunter2-db@db:5432/prod" },
  { secret: "letmein-please", text: "DB_PASSWORD=letmein-please" },
  { secret: "open sesame now", text: '{"api_key": "open sesame now"}' },
  {
    secret: `wJalrXUtnFEMI/K7MDENG/${"bPxRfiCYEXAMPLEKEY".slice(0, 18)}`,
    text: `aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/${"bPxRfiCYEXAMPLEKEY".slice(0, 18)}`,
  },
];

function rawStoreText(chronicleDir: string): string {
  let all = "";
  for (const root of ["sessions", ".local/ops"]) {
    const rootDir = path.join(chronicleDir, ...root.split("/"));
    let entries: string[] = [];
    try {
      entries = (readdirSync(rootDir, { recursive: true }) as string[]).map(String);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const file = path.join(rootDir, entry);
      try {
        all += readFileSync(file, "utf8");
      } catch {
        // directories
      }
    }
  }
  return all;
}

describe("leak guard", () => {
  it("no secret of any class survives the pipeline to disk", async () => {
    const workspaceRoot = makeTempChronicleDir("chronicle-leak-");
    dirs.push(workspaceRoot);
    const chronicleDir = path.join(workspaceRoot, ".chronicle");
    mkdirSync(chronicleDir);
    // The env-harvested secret lives where real ones do: in .env.
    writeFileSync(
      path.join(workspaceRoot, ".env"),
      `DB_PASSWORD="env-file-secret-Va1ue!987654"\nNODE_ENV=development\n`,
    );

    const engine = await EventEngine.open(chronicleDir, {
      workspaceId: WORKSPACE,
      provider: { id: "example-tool", version: "1.0.0" },
      gitReader: fixedGitReader(),
      fsyncIntervalMs: 0,
    });
    const session = newId("session");
    for (const { text } of CONTEXTUAL) {
      await engine.emit({
        type: "PromptSubmitted",
        session,
        actor: { kind: "human" },
        payload: { text: `connect with ${text} and continue` },
      });
    }
    for (const secret of SYNTHETIC_SECRETS) {
      // Secrets arrive in prompts, responses, tool summaries, deep structures.
      await engine.emit({
        type: "PromptSubmitted",
        session,
        actor: { kind: "human" },
        payload: { text: `please use ${secret} for the deploy` },
      });
      await engine.emit({
        type: "ToolExecuted",
        session,
        payload: {
          tool: "bash",
          outcome: "success",
          summary: `ran with ${secret}`,
          durationMs: 10,
          extra: { nested: [secret] },
        },
      });
    }
    await engine.close();

    const raw = rawStoreText(chronicleDir);
    expect(raw.length).toBeGreaterThan(0);
    for (const secret of SYNTHETIC_SECRETS) {
      expect(raw, `SECRET REACHED DISK: class of ${secret.slice(0, 4)}…`).not.toContain(secret);
    }
    for (const { secret } of CONTEXTUAL) {
      expect(raw, `CONTEXTUAL SECRET REACHED DISK: ${secret.slice(0, 3)}…`).not.toContain(secret);
    }
    // ...and the context around them survived (only the secret was removed).
    expect(raw).toContain("postgres://app:[REDACTED:url-credential:");
    expect(raw).toContain("DB_PASSWORD=[REDACTED:credential-assignment:");
    expect(raw).toContain("[REDACTED:");

    // And the retroactive audit agrees the store is clean.
    const report = await runDoctor(chronicleDir, { workspaceId: WORKSPACE, scanSecrets: true });
    expect(report.secrets?.findings).toEqual([]);
    expect(report.ok).toBe(true);
  });
});
