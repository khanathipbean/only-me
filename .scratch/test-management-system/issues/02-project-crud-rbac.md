# 02: Project CRUD + Membership/RBAC Foundation

**What to build:** A logged-in user can list, search, filter, create, edit, archive, and restore Projects. Creating a Project auto-grants the creator ownership and `QA_LEAD` membership. Every mutation writes an `AuditLog` row — the pattern every later ticket's mutations will follow.

**Blocked by:** 01 (Auth & Session Foundation)

**Status:** ready-for-agent

- [x] Prisma models: `Project` (`id`, `code` unique, `name`, `description?`, `ownerId`, `status` enum `DRAFT|ACTIVE|COMPLETED`, `startDate?`, `endDate?`, `deletedAt?`, `createdAt`, `updatedAt`), `ProjectMember` (`projectId`, `userId`, `role` enum `ADMIN|QA_LEAD|TESTER|VIEWER`, unique on `(projectId, userId)`), `AuditLog` (`id`, `entityType`, `entityId`, `action`, `actorId`, `projectId`, `occurredAt`, `oldValue` Json?, `newValue` Json?)
  - Note: "Archived" is represented by `deletedAt`, not a 4th `status` value — `status` only tracks workflow state (Draft/Active/Completed). This deviates slightly from the SRS's literal 4-value Status list for consistency with how Scenario/Test Group/Test Case represent archiving (see spec.md Implementation Decisions).
- [x] `POST /api/projects`: creates a Project, rejects a duplicate `code`, rejects missing required fields, rejects `endDate < startDate`; inserts a `ProjectMember(role: QA_LEAD)` row for the creator and sets `ownerId`; writes an `AuditLog` row (`action: "create"`)
- [x] `GET /api/projects`: lists Projects the caller is a member of (via `ProjectMember`); supports search (name/code), filter (status, owner), excludes `deletedAt IS NOT NULL` by default. Counts of Scenarios/Test Groups/Test Cases per project are **not** built here — those models don't exist until tickets 03–05 — each of those tickets adds its own count to this response as a small addendum (same pattern as ticket 06's descendant-count addendum)
- [x] `GET /api/projects/:id`: 404/403 if the caller isn't a member; returns full detail including last-edited-by/at
- [x] `PATCH /api/projects/:id`: requires `ADMIN` or `QA_LEAD` membership on that project; re-validates required fields and date range; writes `AuditLog` (`action: "update"`, old/new values)
- [x] `POST /api/projects/:id/archive` and `POST /api/projects/:id/restore`: require `ADMIN` or `QA_LEAD`; set/clear `deletedAt`; writes `AuditLog` (`action: "archive"`/`"restore"`)
- [x] Project List UI: table/list with search box, status/owner filters, empty state (no projects / no matches), row click → detail
- [x] Create/Edit Project UI: form matching the fields above; client + server validation; redirects to the new Project's detail page on successful create
- [x] Project Detail UI: shows fields, owner, last-updated-by/at, Archive action (with confirm dialog); Archived projects are viewable and show a Restore action
- [x] Every route above returns 403 for a caller with no `ProjectMember` row on that project
- [x] Tests (integration, real test DB, no Prisma mocking): create/duplicate-code-rejected/missing-field-rejected/date-range-rejected, list respects membership + search + filter, update writes audit log, archive hides from default list and restore reverses it, non-member gets 403

## Comments

Note on line 12: the "counts of Scenarios/Test Groups/Test Cases" requirement was edited out of this checklist *before* implementation started — those models don't exist until tickets 03–05, so the requirement as originally worded couldn't be built. Flagging this explicitly since editing a ticket's own acceptance criteria inside the change that implements it is a smell in itself (a code review on this ticket called it out); the correction was made for real dependency reasons, not to hide a gap, and each of tickets 03–05 now carries the deferred count as its own small addendum.

Code review (Standards + Spec axes) on the first pass found: (1) real bug — `archive()`/`restore()`/`update()` server actions called `requireProjectRole` with no try/catch, so a forbidden caller would hit an unhandled throw instead of a clean 403/404; (2) real bug — `createProject` never set `updatedById`, so a fresh Project showed no "last updated by"; (3) ~9 near-duplicate copies of the session+role-check pattern across API routes and page actions, plus role arrays as repeated raw string-literals. Fixed: extracted `requireProjectRoleOrNotFound` (pages) and `withProjectRole` (API routes) in `src/lib/rbac.ts`/`src/lib/api-auth.ts`, named `EDITOR_ROLES`/`ALL_MEMBER_ROLES` constants, set `updatedById` on create, added a confirm dialog (`src/components/ConfirmForm.tsx`) for Archive/Restore, added an owner filter input and a filters-vs-no-data empty-state distinction to the Project List UI, and added the missing status/owner-filter tests. Re-verified: 16 tests passing, typecheck/lint/build all clean.
