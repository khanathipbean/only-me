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
    /* One file at a time. Every file shares the one database the global setup
     * starts, and some rules are about the whole of it rather than about one
     * project — "this is the last ADMIN in the system" is the clearest. A
     * test for one of those can clear the ground before it looks, but it
     * cannot stop another file creating an ADMIN between that line and the
     * next, so the suite failed for whoever happened to run it in the wrong
     * order. Giving each file its own schema would buy the parallelism back;
     * until then, correctness is worth the seconds. */
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
