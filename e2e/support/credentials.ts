/**
 * The account the suite signs in as. Kept apart from `seed.ts` on purpose:
 * that module imports Prisma, and the spec process has no business opening a
 * database connection — nor would it reach the right one, since only the
 * global setup assigns `DATABASE_URL`.
 */
export const E2E_EMAIL = process.env.E2E_EMAIL ?? "admin@example.com";
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "changeme123";

/** A second account that is a member of the fixture project but not an ADMIN
 *  of anything, so the permission tests have someone to be refused as. */
export const E2E_VIEWER_EMAIL = "viewer@example.com";
export const E2E_VIEWER_PASSWORD = "changeme123";
