import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tests are TypeScript source under test/ — never the compiled JS in
    // dist/. Scoping here keeps a stale dist/test (e.g. restored from a
    // turbo build cache produced by an older config) from being run as if
    // it were the suite. `pnpm build` today is src-only, so dist/test is
    // always stale when present.
    include: ["test/**/*.{test,spec}.ts"],
    // Design law 7: zero network — every test run denies TCP/DNS/HTTP.
    setupFiles: ["../../test-setup/deny-network.mjs"],
    // Real-git / child-process / property suites slow markedly under
    // full-workspace parallel load; budgets are asserted INSIDE tests, so a
    // generous wall-clock timeout weakens no perf gate.
    testTimeout: 30_000,
  },
});
