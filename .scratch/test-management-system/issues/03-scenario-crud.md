# 03: Scenario CRUD (no move)

**What to build:** Within a Project, a QA Lead can list, search, filter, create, view, edit, duplicate, archive, and delete Scenarios. Moving a Scenario to another Project is deliberately excluded — see ticket 06.

**Blocked by:** 02 (Project CRUD + Membership/RBAC Foundation)

**Status:** ready-for-agent

- [x] Prisma model `Scenario`: `id` (system-generated, unique, human-referenceable), `projectId`, `name`, `description?`, `preconditions?`, `testData?`, `steps?`, `expectedResult`, `priority` enum `CRITICAL|HIGH|MEDIUM|LOW`, `status` enum `DRAFT|READY|IN_PROGRESS|COMPLETED`, `tags` (string array), `ownerId?`, `deletedAt?`, audit timestamps. No uniqueness constraint on `name`.
- [x] `POST /api/projects/:projectId/scenarios`: requires `ADMIN`/`QA_LEAD` on the project; rejects missing `name` or `expectedResult`; writes `AuditLog`
- [x] `GET /api/projects/:projectId/scenarios`: search/filter/sort, excludes archived by default. Counts of Test Groups/Test Cases per Scenario are **not** built here — those models don't exist until tickets 04–05 — each adds its own count as a small addendum (same pattern as ticket 02's deferred counts)
- [x] `GET /api/scenarios/:id`: detail including its Test Groups (empty list is fine until ticket 04 lands)
- [x] `PATCH /api/scenarios/:id`: edit; writes `AuditLog`
- [x] `POST /api/scenarios/:id/duplicate`: copies all fields (new `id`, name unchanged — duplicates are allowed), no Test Groups copied
- [x] `POST /api/scenarios/:id/archive` / `restore` / `DELETE /api/scenarios/:id`: delete requires an explicit `confirm: true` body flag; all three write `AuditLog`; delete and archive both set `deletedAt` (framing differs in the UI, not storage)
- [x] Scenario List UI (under a Project): search/filter/sort, empty state, row click → detail
- [x] Create/Edit Scenario UI: fields above; required-field validation
- [x] Scenario Detail UI: fields, Test Groups section (empty state until ticket 04), Duplicate/Archive/Delete actions with confirm dialogs
- [x] Tests: create validation (missing name/expectedResult rejected), scenario correctly scoped to its Project, duplicate copies fields without copying children, archive/restore/delete-with-confirm, non-member 403

## Comments

Same up-front correction as ticket 02: the GET-list count requirement was edited before implementation since Test Group/Test Case don't exist until tickets 04–05.

Code review (Standards + Spec axes) found two real bugs before this was done: (1) `ScenarioDetailPage` gated *viewing* with `EDITOR_ROLES` instead of `ALL_MEMBER_ROLES`, so a Tester/Viewer project member could see the Scenario in the list but hit a 404 opening it — inconsistent with the API and the list page, which were both correct; (2) `sort` was listed in this ticket's own acceptance criteria but never implemented in the service, API, or UI. Both fixed. Standards review also found: audit-log-write boilerplate repeated across all 6 mutation functions in `src/lib/scenarios.ts` (extracted `logScenarioEvent`/`setScenarioDeletedAt`), the new `withEntityProjectRole` duplicating `withProjectRole`'s role-check block in `src/lib/api-auth.ts` (extracted a shared `checkProjectRole`), and pages closing over a nullable `scenario` forcing `scenario!.projectId` everywhere (fixed by hoisting `const projectId = scenario.projectId` right after the `notFound()` guard, matching ticket 02's own convention). Added a test for a caller who is a real member of a *different* project (not just a total outsider) hitting 403 on someone else's Scenario. Re-verified: 22 tests passing, typecheck/lint/build all clean.
