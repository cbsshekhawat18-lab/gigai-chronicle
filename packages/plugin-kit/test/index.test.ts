import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "../src/index.js";

describe("package identity", () => {
  it("entry export matches package.json name", () => {
    const manifest: { name: string } = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );
    expect(manifest.name).toBe(PACKAGE_NAME);
  });
});
