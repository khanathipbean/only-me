/**
 * Refuses to run against anything but a local database.
 *
 * This repo's `.env` points `DATABASE_URL` at the live Supabase instance —
 * the same rows the team works in — and a browser test drives the real UI:
 * it archives, deletes and renames for real. A suite pointed at that would
 * destroy live data on its first run, so the check is here rather than in a
 * paragraph of a README nobody re-reads.
 *
 * `E2E_DATABASE_URL` (see database.ts) is where the suite actually points,
 * and `playwright.config.ts` hands the same value to the dev server it starts,
 * so the app under test and this check can never disagree. All it needs is:
 *
 *   npm run db:dev        # Postgres on 54330, once
 *   npm run test:e2e
 *
 * `E2E_ALLOW_REMOTE_DB=1` opts out, for the case where you genuinely mean to
 * point at a deployed environment and have decided that is safe.
 */
import { E2E_DATABASE_URL } from "./database";

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1", "0.0.0.0"];

export function assertSafeDatabase() {
  if (process.env.E2E_ALLOW_REMOTE_DB === "1") {
    return;
  }

  let host: string;
  try {
    host = new URL(E2E_DATABASE_URL).hostname;
  } catch {
    return;
  }

  if (!LOCAL_HOSTS.includes(host)) {
    throw new Error(
      `DATABASE_URL points at "${host}", which is not a local database.\n` +
        "These tests drive the real UI and will archive, rename and delete real rows.\n" +
        "Point DATABASE_URL at the local dev database (see e2e/support/guard.ts),\n" +
        "or set E2E_ALLOW_REMOTE_DB=1 if you are certain this is safe.",
    );
  }
}
