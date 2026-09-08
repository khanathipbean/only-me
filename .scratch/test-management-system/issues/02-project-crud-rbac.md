# 02: Project CRUD + Membership/RBAC Foundation

**What to build:** A logged-in user can list, search, filter, create, edit, archive, and restore Projects. Creating a Project auto-grants the creator ownership and `QA_LEAD` membership. Every mutation writes an `AuditLog` row — the pattern every later ticket's mutations will follow.

**Blocked by:** 01 (Auth & Session Foundation)

**Status:** ready-for-agent

- [ ] Prisma models: `Project` (`id`, `code` unique, `name`, `description?`, `ownerId`, `status` enum `DRAFT|ACTIVE|COMPLETED`, `startDate?`, `endDate?`, `deletedAt?`, `createdAt`, `updatedAt`), `ProjectMember` (`projectId`, `userId`, `role` enum `ADMIN|QA_LEAD|TESTER|VIEWER`, unique on `(projectId, userId)`), `AuditLog` (`id`, `entityType`, `entityId`, `action`, `actorId`, `projectId`, `occurredAt`, `oldValue` Json?, `newValue` Json?)
  - Note: "Archived" is represented by `deletedAt`, not a 4th `status` value — `status` only tracks workflow state (Draft/Active/Completed). This deviates slightly from the SRS's literal 4-value Status list for consistency with how Scenario/Test Group/Test Case represent archiving (see spec.md Implementation Decisions).
- [ ] `POST /api/projects`: creates a Project, rejects a duplicate `code`, rejects missing required fields, rejects `endDate < startDate`; inserts a `ProjectMember(role: QA_LEAD)` row for the creator and sets `ownerId`; writes an `AuditLog` row (`action: "create"`)
- [ ] `GET /api/projects`: lists Projects the caller is a member of (via `ProjectMember`), with counts of Scenarios/Test Groups/Test Cases per project; supports search (name/code), filter (status, owner), excludes `deletedAt IS NOT NULL` by default
- [ ] `GET /api/projects/:id`: 404/403 if the caller isn't a member; returns full detail including last-edited-by/at
- [ ] `PATCH /api/projects/:id`: requires `ADMIN` or `QA_LEAD` membership on that project; re-validates required fields and date range; writes `AuditLog` (`action: "update"`, old/new values)
- [ ] `POST /api/projects/:id/archive` and `POST /api/projects/:id/restore`: require `ADMIN` or `QA_LEAD`; set/clear `deletedAt`; writes `AuditLog` (`action: "archive"`/`"restore"`)
- [ ] Project List UI: table/list with search box, status/owner filters, empty state (no projects / no matches), row click → detail
- [ ] Create/Edit Project UI: form matching the fields above; client + server validation; redirects to the new Project's detail page on successful create
- [ ] Project Detail UI: shows fields, owner, last-updated-by/at, Archive action (with confirm dialog); Archived projects are viewable and show a Restore action
- [ ] Every route above returns 403 for a caller with no `ProjectMember` row on that project
- [ ] Tests (integration, real test DB, no Prisma mocking): create/duplicate-code-rejected/missing-field-rejected/date-range-rejected, list respects membership + search + filter, update writes audit log, archive hides from default list and restore reverses it, non-member gets 403
