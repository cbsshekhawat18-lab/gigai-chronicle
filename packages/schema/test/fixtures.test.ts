/**
 * The conformance corpus test — every committed fixture behaves exactly as
 * its directory promises. These fixtures seed the public Spec v1 corpus
 * (SPEC-ROADMAP.md §3): a third-party implementation is conformant when it
 * produces the same verdicts.
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CORE_EVENT_TYPES, parseChronicleEvent } from "../src/index.js";

const fixturesUrl = (rel: string) => new URL(`../fixtures/${rel}`, import.meta.url);
const readJson = (rel: string): unknown => JSON.parse(readFileSync(fixturesUrl(rel), "utf8"));
const list = (dir: string) =>
  readdirSync(fixturesUrl(dir))
    .filter((f) => f.endsWith(".json"))
    .sort();

describe("fixture corpus", () => {
  it("has one valid and one invalid fixture per core type", () => {
    const expected = [...CORE_EVENT_TYPES].map((t) => `${t}.json`).sort();
    expect(list("valid")).toEqual(expected);
    expect(list("invalid")).toEqual(expected);
  });

  for (const file of list("valid")) {
    it(`valid/${file} parses ok`, () => {
      const result = parseChronicleEvent(readJson(`valid/${file}`));
      expect(result).toMatchObject({ ok: true, kind: "core" });
    });
  }

  for (const file of list("invalid")) {
    it(`invalid/${file} is rejected as INVALID (never a crash)`, () => {
      const result = parseChronicleEvent(readJson(`invalid/${file}`));
      expect(result).toMatchObject({ ok: false, code: "INVALID" });
    });
  }

  it("forward-compat fixtures match their recorded expectations", () => {
    const expectations = readJson("forward-compat/expectations.json") as Record<
      string,
      { ok: boolean; code?: string }
    >;
    const files = list("forward-compat").filter((f) => f !== "expectations.json");
    expect(files.sort()).toEqual(Object.keys(expectations).sort());

    for (const [file, expected] of Object.entries(expectations)) {
      const result = parseChronicleEvent(readJson(`forward-compat/${file}`));
      expect(result.ok, file).toBe(expected.ok);
      if (!result.ok && expected.code !== undefined) {
        expect(result.code, file).toBe(expected.code);
      }
    }
  });

  it("unknown-fields fixture: unknown fields survive parse (byte-preservation contract)", () => {
    const result = parseChronicleEvent(readJson("forward-compat/unknown-fields.json"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      const event = result.event as Record<string, unknown>;
      expect(event["futureTopLevelField"]).toEqual({ anything: true });
      expect((event["git"] as Record<string, unknown>)["futureGitField"]).toBe(1);
      expect((event["payload"] as Record<string, unknown>)["futurePayloadField"]).toBe("kept");
    }
  });
});
