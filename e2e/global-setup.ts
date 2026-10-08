import { execFileSync } from "node:child_process";
import { E2E_DATABASE_URL } from "./support/database";
import { assertSafeDatabase } from "./support/guard";

/** tsx's own entry point, run by Node. Not `npx`, and not the `.bin` shim:
 *  recent Node refuses to spawn a `.cmd` without a shell, and arguments
 *  passed through a shell are concatenated rather than escaped. */
const TSX_CLI = "node_modules/tsx/dist/cli.mjs";

/** Prisma's own entry point, run the same way and for the same reason. */
const PRISMA_CLI = "node_modules/prisma/build/index.js";

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

  /* The schema first, every run.
   *
   * This step was missing and the suite rotted quietly: `e2edb` had been
   * pushed by hand once, long enough ago that it held fifteen of the schema's
   * eighteen tables, and every spec since then failed on the first query to
   * one of the three that arrived later. A failing suite is noticed; one that
   * has been broken so long nobody runs it is not, and this one was not
   * running when a page shipped broken for every reader.
   *
   * `--accept-data-loss` is the point of a separate database rather than a
   * risk taken with one: this is the database the tests are allowed to break,
   * `assertSafeDatabase` has already refused anything that is not local, and
   * the seed below puts back everything the suite needs. */
  execFileSync(process.execPath, [PRISMA_CLI, "db", "push", "--accept-data-loss"], {
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
    stdio: "inherit",
  });

  execFileSync(process.execPath, [TSX_CLI, "scripts/seed-e2e.ts"], {
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
    stdio: "inherit",
  });
}
