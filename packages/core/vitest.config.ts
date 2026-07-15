import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Design law 7: zero network — every test run denies TCP/DNS/HTTP.
    setupFiles: ["../../test-setup/deny-network.mjs"],
    // Real-git / child-process / property suites slow markedly under
    // full-workspace parallel load; budgets are asserted INSIDE tests, so a
    // generous wall-clock timeout weakens no perf gate.
    testTimeout: 30_000,
  },
});
