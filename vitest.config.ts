import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    /* Playwright owns `e2e/`. Vitest's default `include` would otherwise
     * collect `e2e/*.spec.ts` and run Playwright's own `test()` under the
     * wrong runner, which fails in a way that reads like a broken test. */
    exclude: ["**/node_modules/**", "**/.next/**", "e2e/**"],
    globalSetup: ["./tests/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
