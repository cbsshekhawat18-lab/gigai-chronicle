import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tests are TypeScript source under test/ — never compiled JS in dist/
    // (keeps a stale dist/test from being run as the suite).
    include: ["test/**/*.{test,spec}.ts"],
    // Design law 7: zero network — every test run denies TCP/DNS/HTTP.
    setupFiles: ["../../../test-setup/deny-network.mjs"],
    testTimeout: 30_000,
  },
});
