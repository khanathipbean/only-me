import { execFileSync } from "node:child_process";
import { E2E_DATABASE_URL } from "./support/database";
import { assertSafeDatabase } from "./support/guard";

/** tsx's own entry point, run by Node. Not `npx`, and not the `.bin` shim:
 *  recent Node refuses to spawn a `.cmd` without a shell, and arguments
 *  passed through a shell are concatenated rather than escaped. */
const TSX_CLI = "node_modules/tsx/dist/cli.mjs";

/**
 * Runs once, before the browser starts: checks the suite is pointed at a
 * database it is allowed to write to, then makes sure that database has the
 * one fixture every spec depends on.
 *
 * The seed runs as its own process, with `DATABASE_URL` set for it alone:
 * `@/lib/prisma` opens its connection at import time, so anything importing
 * it here would reach whatever `.env` names — in this repo, the live Supabase
 * instance. A separate process also gets the `@/*` path mapping, which
 * Playwright's own loader does not apply.
 */
export default async function globalSetup() {
  assertSafeDatabase();

  execFileSync(process.execPath, [TSX_CLI, "scripts/seed-e2e.ts"], {
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
    stdio: "inherit",
  });
}
