import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Design law 7: zero network — every test run denies TCP/DNS/HTTP.
    setupFiles: ["../../../test-setup/deny-network.mjs"],
    // Backfill suites do real transcript I/O through the engine and slow
    // markedly under full-workspace parallel load (same rationale, and same
    // value, as packages/core). Behavior is asserted inside the tests, so a
    // generous wall-clock timeout weakens no gate.
    testTimeout: 30_000,
  },
});
