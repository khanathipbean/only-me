# 04: Test Group CRUD (no move)

**What to build:** Within a Scenario, a QA Lead can list, create, view, edit, duplicate, reorder, archive, and delete Test Groups. Moving a Test Group to another Scenario is deliberately excluded — see ticket 06.

**Blocked by:** 03 (Scenario CRUD)

**Status:** ready-for-agent

- [x] Prisma model `TestGroup`: `id`, `scenarioId`, `name`, `description?`, `testObjective?`, `sequence` (int, for ordering), `status` enum `DRAFT|READY|IN_PROGRESS|COMPLETED`, `ownerId?`, `deletedAt?`, audit timestamps. No uniqueness on `name`.
- [x] `POST /api/scenarios/:scenarioId/test-groups`: requires a Scenario to be selected (path param enforces this) and `ADMIN`/`QA_LEAD` role on the parent Project; writes `AuditLog`
- [x] `GET /api/scenarios/:scenarioId/test-groups`: ordered by `sequence`, excludes archived by default. Test Case count per group is **not** built here — that model doesn't exist until ticket 05 — ticket 05 adds it as a small addendum (same pattern as tickets 02/03's deferred counts)
- [x] `PATCH /api/test-groups/:id`: edit fields
- [x] `POST /api/test-groups/reorder`: accepts an ordered list of ids within one Scenario, rewrites `sequence`
- [x] `POST /api/test-groups/:id/duplicate`, `.../archive`, `.../restore`, `DELETE /api/test-groups/:id` (confirm required): same conventions as Scenario ticket
- [x] Test Group List UI (under a Scenario): drag-or-button reorder, empty state (Test Case counts deferred to ticket 05, same as the GET route above)
- [x] Create/Edit Test Group UI
- [x] Test Group Detail UI: fields, Test Cases section (empty state until ticket 05), Duplicate/Archive/Delete actions
- [x] Tests: create requires a Scenario, reorder persists sequence, duplicate/archive/restore/delete-with-confirm, non-member 403 (Test Case count accuracy is tested in ticket 05, once that model exists)

## Comments

Prefactor before implementation: renamed ticket 03's `ScenarioStatus` enum to a shared `WorkflowStatus`, since Test Group (this ticket) and Test Case (ticket 05) use the identical Draft/Ready/In Progress/Completed set — avoids three copies of one enum. Also corrected the GET-list and Tests lines the same way as tickets 02/03 (Test Case counts deferred to ticket 05); the List UI line was initially missed and had to be fixed after Spec review flagged the inconsistency.

Code review (Standards + Spec axes) found one real security/data-integrity bug: `reorderTestGroups` never validated that the submitted `orderedIds` actually belonged to the target Scenario, so an authorized editor on *their own* project could pass Test Group ids from a completely different Scenario/Project and silently overwrite that other Scenario's `sequence` values — a caller-controlled cross-tenant write with no ownership check. Fixed by validating the submitted set exactly matches the Scenario's existing Test Group ids before writing (`InvalidReorderError`, 400 otherwise), and added a regression test using a second Scenario in a second Project. Also fixed the audit-log entry's `entityType`/`entityId` (was misleadingly `TestGroup`/`scenarioId`, now `Scenario`/`scenarioId` with a `reorder-test-groups` action) and deduplicated the List page's `moveUp`/`moveDown` server actions into one `move(id, delta)` helper. Re-verified: 27 tests passing, typecheck/lint/build all clean.
