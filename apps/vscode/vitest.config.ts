import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Unit tests run outside the extension host — mock the vscode API.
      vscode: path.join(here, "test", "mocks", "vscode.ts"),
    },
  },
  test: {
    testTimeout: 30_000,
    // Design law 7: zero network — every test run denies TCP/DNS/HTTP.
    setupFiles: ["../../test-setup/deny-network.mjs"],
  },
});
