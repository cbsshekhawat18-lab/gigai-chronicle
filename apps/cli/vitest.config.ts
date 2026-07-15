import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Design law 7: zero network — every test run denies TCP/DNS/HTTP.
    setupFiles: ["../../test-setup/deny-network.mjs"],
    // Every test here spawns real CLI processes; under full-workspace
    // parallel load the 5s default flakes (same class as core e2e suites).
    testTimeout: 30_000,
  },
});
