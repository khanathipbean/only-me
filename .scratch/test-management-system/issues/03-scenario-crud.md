# 03: Scenario CRUD (no move)

**What to build:** Within a Project, a QA Lead can list, search, filter, create, view, edit, duplicate, archive, and delete Scenarios. Moving a Scenario to another Project is deliberately excluded — see ticket 06.

**Blocked by:** 02 (Project CRUD + Membership/RBAC Foundation)

**Status:** ready-for-agent

- [ ] Prisma model `Scenario`: `id` (system-generated, unique, human-referenceable), `projectId`, `name`, `description?`, `preconditions?`, `testData?`, `steps?`, `expectedResult`, `priority` enum `CRITICAL|HIGH|MEDIUM|LOW`, `status` enum `DRAFT|READY|IN_PROGRESS|COMPLETED`, `tags` (string array), `ownerId?`, `deletedAt?`, audit timestamps. No uniqueness constraint on `name`.
- [ ] `POST /api/projects/:projectId/scenarios`: requires `ADMIN`/`QA_LEAD` on the project; rejects missing `name` or `expectedResult`; writes `AuditLog`
- [ ] `GET /api/projects/:projectId/scenarios`: search/filter/sort, counts of Test Groups/Test Cases per Scenario, excludes archived by default
- [ ] `GET /api/scenarios/:id`: detail including its Test Groups (empty list is fine until ticket 04 lands)
- [ ] `PATCH /api/scenarios/:id`: edit; writes `AuditLog`
- [ ] `POST /api/scenarios/:id/duplicate`: copies all fields (new `id`, name unchanged — duplicates are allowed), no Test Groups copied
- [ ] `POST /api/scenarios/:id/archive` / `restore` / `DELETE /api/scenarios/:id`: delete requires an explicit `confirm: true` body flag; all three write `AuditLog`; delete and archive both set `deletedAt` (framing differs in the UI, not storage)
- [ ] Scenario List UI (under a Project): search/filter/sort, empty state, row click → detail
- [ ] Create/Edit Scenario UI: fields above; required-field validation
- [ ] Scenario Detail UI: fields, Test Groups section (empty state until ticket 04), Duplicate/Archive/Delete actions with confirm dialogs
- [ ] Tests: create validation (missing name/expectedResult rejected), scenario correctly scoped to its Project, duplicate copies fields without copying children, archive/restore/delete-with-confirm, non-member 403
