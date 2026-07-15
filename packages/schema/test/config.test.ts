import { describe, expect, it } from "vitest";
import { configSchema, newId } from "../src/index.js";

/** The ARCHITECTURE.md §7.3 sketch, with a concrete project id. */
function sampleConfig(): Record<string, unknown> {
  return {
    $schema: "https://schemas.chronicle.dev/config/1.json",
    version: 1,
    project: { id: newId("project"), name: "acme-api" },
    capture: {
      providers: { "example-tool": "auto", "another-tool": "off" },
      redaction: { secrets: true, customPatterns: [] },
      visibility: "shared",
      gitTrailer: false,
    },
    storage: { digest: { session: true }, retention: { mode: "keep-all" } },
  };
}

describe("config.json schema (§7.3)", () => {
  it("accepts the spec sketch", () => {
    expect(configSchema.safeParse(sampleConfig()).success).toBe(true);
  });

  it("preserves unknown keys (reserved sync/plugins arrive in later phases)", () => {
    const parsed = configSchema.parse({ ...sampleConfig(), sync: { mode: "off" } });
    expect((parsed as Record<string, unknown>)["sync"]).toEqual({ mode: "off" });
  });

  it("rejects a malformed project id", () => {
    const config = sampleConfig();
    (config["project"] as Record<string, unknown>)["id"] = "prj_nope";
    expect(configSchema.safeParse(config).success).toBe(false);
  });

  it("rejects unknown provider modes and retention modes", () => {
    const config = sampleConfig();
    (config["capture"] as Record<string, Record<string, unknown>>)["providers"] = {
      tool: "sometimes",
    };
    expect(configSchema.safeParse(config).success).toBe(false);

    const config2 = sampleConfig();
    (config2["storage"] as Record<string, unknown>)["retention"] = { mode: "delete-old" };
    expect(configSchema.safeParse(config2).success).toBe(false);
  });
});
