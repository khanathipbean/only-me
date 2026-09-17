/**
 * The database the browser tests are allowed to touch.
 *
 * They drive the real UI: they archive, rename and delete for real. This
 * repo's `.env` points `DATABASE_URL` at the live Supabase instance, so the
 * suite gets its own connection string rather than inheriting that one — the
 * default being the local Postgres that `npm run db:dev` starts.
 *
 * `playwright.config.ts` passes this to the dev server it launches, and
 * `guard.ts` refuses to run if it is not local. Both read it from here so the
 * two can never drift apart.
 *
 * A database of its own (`e2edb`) on the same server `npm run db:dev` starts,
 * not the `devdb` beside it: these tests delete things, and whatever someone
 * has been building by hand in their dev database is not theirs to clear.
 */
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54330/e2edb";

/** The port the test app runs on — deliberately not 3000, so the dev server
 *  someone already has open (pointed at whatever they were working on) is
 *  never mistaken for this one. */
export const E2E_PORT = process.env.E2E_PORT ?? "3100";

export const E2E_BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${E2E_PORT}`;
