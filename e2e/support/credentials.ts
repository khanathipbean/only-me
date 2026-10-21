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

/** A third account, holding the DEV role on the fixture project: it reads
 *  what a VIEWER reads and may change one thing, so the pages it must not
 *  reach can only be checked by somebody actually holding the role. */
export const E2E_DEV_EMAIL = "dev@example.com";
export const E2E_DEV_PASSWORD = "changeme123";

/** A round with one case in it, seeded because building the five levels above
 *  a Test Case through the UI is most of a spec on its own. */
export const E2E_HANDOFF_RUN = "E2E Hand-off Round";
export const E2E_HANDOFF_GROUP = "Hand-off";
export const E2E_HANDOFF_CASE = "TC-HANDOFF-001 A case to hand over";

/** A second case in that round, seeded already handed to the DEV account, so
 *  the specs that act as a DEV have something on their My Work page without
 *  first driving another account's session to put it there. */
export const E2E_ASSIGNED_CASE = "TC-HANDOFF-002 A case already handed over";

/** A third, handed over with a deadline that has already passed, so the
 *  "overdue goes to the top and turns red" rule has something to act on. */
export const E2E_OVERDUE_CASE = "TC-HANDOFF-003 A case that is already late";

/** The fixture file the seed points at an object that was never uploaded. */
export const MISSING_FILE_NAME = "gone-from-storage.pdf";
