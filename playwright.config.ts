import { defineConfig, devices } from "@playwright/test";
import { E2E_BASE_URL, E2E_DATABASE_URL, E2E_PORT } from "./e2e/support/database";

/**
 * End-to-end tests, run in a real browser against a running app.
 *
 * They sit beside the Vitest suite rather than replacing any of it: Vitest
 * covers the services against a throwaway Postgres, which is where the
 * business rules live and where it is cheap to test them. This is for the
 * things only a browser can answer — a dialog that opens, a toast that shows
 * up in the right corner, a dropdown that stays inside the modal it belongs
 * to — all of which have been found by hand in this project so far.
 *
 * `testDir` keeps them out of Vitest's way, and `vitest.config.ts` excludes
 * this directory in turn: Vitest's default `include` would otherwise collect
 * `e2e/*.spec.ts` and run Playwright's `test()` under the wrong runner.
 */
export default defineConfig({
  testDir: "./e2e",
  /* Checks the target database is a local one and puts the baseline fixture
   * in it — see e2e/global-setup.ts. */
  globalSetup: "./e2e/global-setup.ts",
  /* One at a time by default. These share one app and one database, so
   * parallel workers editing the same rows would fail for reasons that have
   * nothing to do with the code under test. */
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: E2E_BASE_URL,
    /* Kept only for a failure: a trace of every passing run fills the disk
     * fast, and the first thing anyone wants from a red test is the trace. */
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },

  projects: [
    /* Signs in once and writes the session to disk; everything else starts
     * already logged in, rather than driving the login form 30 times. */
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],

  /* Its own dev server on its own port, wired to its own database — never
   * the one already open on 3000, which is pointed at whatever the developer
   * was working on (here, the live Supabase instance). Requires the local
   * Postgres to be up:
   *
   *   npm run db:dev
   *
   * `next dev` compiles each route on first request, so the first navigation
   * of a cold run is slow — hence the generous timeout. */
  webServer: {
    command: `npm run dev -- --port ${E2E_PORT}`,
    url: E2E_BASE_URL,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      /* Its own build directory as well as its own port: Next holds a lock in
       * there and refuses to start a second dev server out of the same one. */
      NEXT_DIST_DIR: ".next-e2e",
    },
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
