# 04: Test Group CRUD (no move)

**What to build:** Within a Scenario, a QA Lead can list, create, view, edit, duplicate, reorder, archive, and delete Test Groups. Moving a Test Group to another Scenario is deliberately excluded — see ticket 06.

**Blocked by:** 03 (Scenario CRUD)

**Status:** ready-for-agent

- [ ] Prisma model `TestGroup`: `id`, `scenarioId`, `name`, `description?`, `testObjective?`, `sequence` (int, for ordering), `status` enum `DRAFT|READY|IN_PROGRESS|COMPLETED`, `ownerId?`, `deletedAt?`, audit timestamps. No uniqueness on `name`.
- [ ] `POST /api/scenarios/:scenarioId/test-groups`: requires a Scenario to be selected (path param enforces this) and `ADMIN`/`QA_LEAD` role on the parent Project; writes `AuditLog`
- [ ] `GET /api/scenarios/:scenarioId/test-groups`: ordered by `sequence`, includes Test Case count per group, excludes archived by default
- [ ] `PATCH /api/test-groups/:id`: edit fields
- [ ] `POST /api/test-groups/reorder`: accepts an ordered list of ids within one Scenario, rewrites `sequence`
- [ ] `POST /api/test-groups/:id/duplicate`, `.../archive`, `.../restore`, `DELETE /api/test-groups/:id` (confirm required): same conventions as Scenario ticket
- [ ] Test Group List UI (under a Scenario): shows Test Case counts, drag-or-button reorder, empty state
- [ ] Create/Edit Test Group UI
- [ ] Test Group Detail UI: fields, Test Cases section (empty state until ticket 05), Duplicate/Archive/Delete actions
- [ ] Tests: create requires a Scenario, reorder persists sequence, duplicate/archive/restore/delete-with-confirm, Test Case count is accurate, non-member 403
