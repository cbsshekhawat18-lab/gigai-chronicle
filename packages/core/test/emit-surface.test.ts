/**
 * M5 DoD #5, honest version: providers reach core ONLY via the emit surface
 * (boundary lint enforces the import path; this test pins what that path
 * exposes). The surface must never leak the store, the index, or queries —
 * a provider with those handles could skip the pipeline.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as emitSurface from "../src/emit.js";

describe("the emit surface", () => {
  it("exposes exactly the provider API — no store, no index, no doctor", () => {
    expect(Object.keys(emitSurface).sort()).toEqual([
      "EventEngine",
      "MAX_CANDIDATE_BYTES",
      "fixedGitReader",
      "openProviderEngine",
    ]);
  });

  it("is published as the ./emit subpath (what the boundary lint allows)", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { exports: Record<string, unknown> };
    expect(Object.keys(manifest.exports).sort()).toEqual([".", "./emit"]);
  });
});
