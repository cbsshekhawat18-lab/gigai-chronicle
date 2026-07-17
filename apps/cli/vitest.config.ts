import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Design law 7: zero network — every test run denies TCP/DNS/HTTP.
    setupFiles: ["../../test-setup/deny-network.mjs"],
    // Every test here spawns real CLI processes; under full-workspace
    // parallel load the 5s default flakes (same class as core e2e suites).
    testTimeout: 30_000,
    // Suite fixtures spawn the same real processes (git init + CLI runs) and
    // need the same headroom — hookTimeout does NOT inherit testTimeout, and
    // its 10s default is what flakes first when the workspace runs hot.
    hookTimeout: 30_000,
  },
});
