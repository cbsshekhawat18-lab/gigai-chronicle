import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { harvestEnvValues } from "../src/index.js";
import { makeTempChronicleDir } from "./helpers/events.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("env harvest", () => {
  it("parses common .env forms and keeps only secret-worthy values", async () => {
    const root = makeTempChronicleDir("chronicle-env-");
    dirs.push(root);
    writeFileSync(
      path.join(root, ".env"),
      [
        "# comment",
        "DB_PASSWORD=super-secret-value-1",
        `API_KEY="quoted-secret-value-2"`,
        "export TOKEN='exported-secret-3'",
        "WITH_COMMENT=inline-secret-4 # not part of it",
        "NODE_ENV=development", // trivial
        "PORT=5432", //             numeric
        "SHORT=abc", //             too short
        "not a valid line",
      ].join("\n"),
    );
    writeFileSync(path.join(root, ".env.local"), "LOCAL_SECRET=local-secret-value-5\n");

    const values = await harvestEnvValues(root);
    expect(values.sort()).toEqual([
      "exported-secret-3",
      "inline-secret-4",
      "local-secret-value-5",
      "quoted-secret-value-2",
      "super-secret-value-1",
    ]);
  });

  it("missing env files mean an empty harvest, not an error", async () => {
    const root = makeTempChronicleDir("chronicle-env-none-");
    dirs.push(root);
    mkdirSync(path.join(root, "sub"));
    expect(await harvestEnvValues(root)).toEqual([]);
  });
});
