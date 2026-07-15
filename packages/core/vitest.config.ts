import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Design law 7: zero network — every test run denies TCP/DNS/HTTP.
    setupFiles: ["../../test-setup/deny-network.mjs"],
  },
});
