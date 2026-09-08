Status: ready-for-agent

# Test Management System

Source: System Requirement Specification v1.0 (2026-09-08), provided in conversation.

## Problem Statement

QA teams currently have no single, structured place to design and track the test artifacts for a project. Test scenarios, the groups of checks within them, and the individual test cases are scattered across spreadsheets or ad hoc documents. There is no shared view of how a scenario decomposes into test groups and cases, no way to see testing progress at a glance, and no record of who changed what and when.

## Solution

A web application where a user creates a **Project** and, within it, builds a strict four-level hierarchy — **Project → Scenario → Test Group → Test Case** — either by filling in forms or by importing rows from an Excel/CSV file. Every project has a **Dashboard** summarizing counts and test-result progress across the hierarchy, with drill-down, filtering, and search. Access is controlled by **role** (Admin, QA Lead, Tester, Viewer), scoped per project via project membership. Every change that affects tracked data is written to an **Audit Trail**.

## User Stories

### Auth & RBAC

1. As any user, I want to log in with email and password, so that only authenticated users can reach the system.
2. As an Admin, I want to assign a Role (Admin, QA Lead, Tester, Viewer) to a user within a Project's membership, so that access matches their responsibility.
3. As a Tester, I want to be blocked from editing Test Case fields other than Test Result, Notes, and Attachment, so that I can't accidentally change the test design.
4. As a Viewer, I want every write action hidden or rejected, so that I can only read data.
5. As any user, I want to be denied access to a Project I'm not a member of, so that project data stays private to its team.

### Project Management

6. As a QA Lead, I want to see a list of Projects I have access to, with name, code, description, owner, status, and counts of Scenarios/Test Groups/Test Cases, so that I can pick the one I need.
7. As a QA Lead, I want to search Projects by name or code and filter by status/owner, so that I can find one quickly among many.
8. As a QA Lead, I want to see an Empty State when there are no Projects or none match my filters, so that I know the list isn't broken.
9. As a QA Lead, I want to create a Project with a unique Project Code, name, owner, optional description/members/dates, and a status, so that I have a container for my test design.
10. As a QA Lead, I want project creation to reject a duplicate Project Code and any missing required field, so that data stays valid.
11. As a QA Lead, I want an End Date earlier than the Start Date to be rejected, so that the date range makes sense.
12. As the creator of a Project, I want to automatically become its Owner, so that I don't have to grant myself access afterward.
13. As a QA Lead, I want to be taken straight to the new Project's detail page after creating it, so that I can start adding Scenarios immediately.
14. As a QA Lead, I want to edit a Project's fields, so that I can keep its metadata current.
15. As any viewer of a Project, I want to see who last edited it and when, so that I know the data is current.
16. As a QA Lead, I want to Archive a Project after confirming, so that it disappears from the active list without deleting its Scenarios, Test Groups, or Test Cases.
17. As a QA Lead, I want to view and Restore an Archived Project, so that archiving isn't a dead end.

### Scenario Management

18. As a QA Lead, I want to see all Scenarios under the Project I have open, with name, description, preconditions, expected result, priority, status, counts, and last-updated info, so that I can review test design at a glance.
19. As a QA Lead, I want to search, filter, and sort Scenarios within a Project, so that I can navigate a large list.
20. As a QA Lead, I want to create a Scenario under the current Project with name and expected result required (description, preconditions, test data, steps, priority, status, tags, owner optional/defaulted), so that I can capture an end-to-end test idea.
21. As a QA Lead, I want the system to reject saving a Scenario without a name or expected result, so that every Scenario is minimally usable.
22. As a QA Lead, I want each Scenario to get a unique, system-generated Scenario ID, so that I can reference it unambiguously.
23. As a QA Lead, I want to view a Scenario's detail page including its Test Groups, so that I can drill into its structure.
24. As a QA Lead, I want to edit, duplicate, or Archive a Scenario, so that I can maintain and reuse test designs.
25. As a QA Lead, I want to move a Scenario to a different Project, carrying its Test Groups and Test Cases with it, so that I can reorganize without re-creating everything.
26. As a QA Lead, I want to be warned about the impact (child counts) before moving, archiving, or deleting a Scenario, so that I don't lose track of what I'm affecting.
27. As a QA Lead, I want to delete a Scenario only after confirming, so that removal is deliberate.

### Test Group Management

28. As a QA Lead, I want to create a Test Group (e.g. Navigation, UI Display, Functional, Validation, Filter and Search, Permission, Error Handling, Import, Performance) under a chosen Scenario, so that I can bucket related Test Cases.
29. As a QA Lead, I want Test Group creation to require selecting a Scenario, name, and status, so that every group has a clear home.
30. As a QA Lead, I want to see how many Test Cases each Test Group holds, and reorder Test Groups by sequence, so that I can organize the Scenario's structure.
31. As a QA Lead, I want to view, edit, duplicate, move (to another Scenario, carrying its Test Cases), Archive, or delete (after confirming) a Test Group, so that I can maintain the structure as it evolves.
32. As a QA Lead, I want impact warnings before a move, Archive, or delete on a Test Group, so that I understand what else is affected.

### Test Case Management

33. As a QA Lead, I want to create a Test Case under a chosen Test Group that checks exactly one behavior, with a name, test steps, and expected result required, so that test coverage stays granular and traceable.
34. As a QA Lead, I want each Test Case to support multiple ordered Test Steps, each with its own expected result, so that multi-step checks are captured precisely.
35. As a QA Lead, I want a new Test Case's Test Result to default to "Not Run" and its ID to be generated automatically, so that state starts consistent.
36. As a QA Lead, I want the system to record who created/last edited a Test Case and when, so that changes are traceable.
37. As a Tester, I want to view a Test Case's detail (steps, expected results, current Test Result, assignee, notes, attachments), so that I know what to execute.
38. As a Tester, I want to update a Test Case's Test Result (Not Run, Passed, Failed, Blocked, Skipped) and have the system record who made the change and when, so that execution history is captured.
39. As a Tester, I want to add Notes and Attachments to a Test Case, so that I can document findings.
40. As a QA Lead, I want to edit, duplicate, move a Test Case to a different Test Group, reassign it, Archive, or delete (after confirming) it, so that I can maintain test coverage.
41. As a QA Lead, I want a moved Test Case to appear only under its new Test Group, not duplicated at the old one, so that counts and structure stay correct.
42. As any viewer, I want Dashboard counts to update immediately after any create/move/Archive/delete/result-update, so that the overview never goes stale.

### Import

43. As a QA Lead, I want to download a Template file for Import, so that I format my data correctly.
44. As a QA Lead, I want to pick a destination Project, upload an Excel/CSV file, and have the system validate file type, size, and required columns before anything is saved, so that bad files are caught early.
45. As a QA Lead, I want to see a Preview of the rows to be imported with per-row validation results before confirming, so that I can catch problems before they become real data.
46. As a QA Lead, I want each invalid row's error to name the row number, field, and reason, so that I can fix my source file or the row in place.
47. As a QA Lead, I want to fix or skip individual invalid rows rather than have the whole import fail, so that one bad row doesn't block the rest.
48. As a QA Lead, I want nothing written to the database until I explicitly confirm the import, so that previewing has no side effects.
49. As a QA Lead, when an incoming row matches an existing Scenario/Test Group/Test Case by name under the same parent, I want to choose to Skip, Update, or Create as New, per row or applied to many rows at once, so that I control how duplicates are handled.
50. As a QA Lead, I want a final Import Summary showing counts of succeeded, failed, and skipped rows, so that I know the outcome.
51. As a QA Lead, I want the import's outcome and duplicate-handling choices recorded in an Import Log, so that I can audit what an import actually did.

### Project Dashboard

52. As any viewer of a Project, I want an overview of total Scenario/Test Group/Test Case counts, Test Case counts by Test Result/Priority/Assignee, and overall Test Progress, so that I can judge project health at a glance.
53. As any viewer, I want Test Progress computed as (Test Cases with a result other than Not Run ÷ total Test Cases) × 100, with no divide-by-zero when there are no Test Cases, so that the number is always meaningful.
54. As any viewer, I want to click through from any Dashboard number to the underlying list of records, so that I can investigate.
55. As any viewer, I want to expand/collapse the Scenario → Test Group → Test Case tree and click any node to open its detail, so that I can navigate the hierarchy visually.
56. As any viewer, I want the expand/collapse state to survive changes to my active filters, so that I don't lose my place.
57. As any viewer, I want to filter the Dashboard by Scenario, Test Group, Test Result, Priority, Status, Assignee, Tags, Created Date, and Updated Date, with the totals, any charts, and the lists all reflecting the same filter, so that the view is internally consistent.
58. As any viewer, I want to clear all filters and see the currently-active filters displayed, so that I always know what I'm looking at.
59. As any viewer, I want a clear Empty State (with a create/import action) when a Project has no data yet, a Loading State scoped to the widget that's loading, an Error State with Retry when a widget fails to load, and a "no results" message when a filter matches nothing, so that every data state is explained.

### Navigation & Search

60. As any user, I want a breadcrumb (e.g. Projects > Project A > Scenario A > Navigation > TC-001) showing where I am, so that I can orient myself and step back up the hierarchy.
61. As any user, I want stepping back via the breadcrumb to preserve my prior search, filters, and list page where possible, so that I don't lose context.
62. As any user, I want to search Projects, Scenarios, Test Groups, and Test Cases from one global search box by name/code/ID, so that I don't have to know which level something lives at.
63. As any user, I want each search result to show its type, Project, and position in the hierarchy, and to be clickable straight to its detail, so that I can act on it immediately.
64. As any user, I want a clear "no results" state when my search matches nothing, so that I know to try another term.

### Audit Trail

65. As an Admin, I want every create, edit, move, Import, Archive, Restore, delete, and Test-Result update on Projects/Scenarios/Test Groups/Test Cases recorded with timestamp, actor, action, entity type/id, and old/new value, so that changes are traceable.
66. As an Admin, I want to search and filter the Audit Trail by Project, user, action, and time range, so that I can investigate a specific change.
67. As any user, I want the Audit Trail to be read-only for everyone, so that history can't be tampered with.
68. As any user, I want all recorded timestamps shown in one consistent, clearly-labeled time zone, so that history isn't ambiguous.

## Implementation Decisions

**Stack (already in this repo):** Next.js 16 App Router + TypeScript, Prisma 7 with `@prisma/adapter-pg` against PostgreSQL. Follow the existing seam: one `route.ts` per resource under `src/app/api/**`, all DB access through the `prisma` singleton at `src/lib/prisma.ts`. This spec adds an ORM data layer + API routes; no UI framework choice is made here (deferred to the Dashboard/CRUD-screen tickets).

**Auth:** Auth.js (NextAuth v5), Credentials provider, Prisma adapter. Session carries `userId`; role is resolved per request from `ProjectMember`, not from the session, since a user's role can differ per Project.

**Hierarchy & soft delete:** `Project 1—N Scenario 1—N TestGroup 1—N TestCase`, enforced by non-nullable foreign keys (BR-001/002/003). Every level (`Project`, `Scenario`, `TestGroup`, `TestCase`) gets a nullable `deletedAt` used for both "Archive" and "Delete" — the spec doesn't distinguish their storage, only their UI/API framing (delete requires an explicit confirm step; archive doesn't). No retention cutoff: archived/deleted rows are kept indefinitely and remain restorable. All list queries default to `deletedAt IS NULL`; an explicit `includeArchived`/`includeDeleted` flag is required to see them.

**Duplicate names:** No uniqueness constraint on `Scenario.name`, `TestGroup.name`, or `TestCase.name`, even under the same parent — duplicates are allowed (only `Project.code` is unique).

**RBAC:** `Role` enum (`ADMIN`, `QA_LEAD`, `TESTER`, `VIEWER`) lives on `ProjectMember(projectId, userId, role)`, not on `User` — a user's role is scoped to the Project. Project creation auto-inserts the creator as a `ProjectMember` with role `QA_LEAD` and marks them `Project.ownerId`. Server-side authorization for every mutation checks `ProjectMember.role` for the Project being touched; `TESTER` is further restricted at the field level on Test Case updates to `testResult`, `notes`, and attachments only.

**Move semantics:** Moving a Scenario/Test Group re-parents it and every descendant in one transaction (re-point the foreign key; nothing is copied or re-created), satisfying BR-006/007 and "no duplicate at the old location" by construction.

**Import:** Excel (`.xlsx`) and CSV only. Parse server-side (library choice made in the Import ticket). Duplicate detection matches by `name` scoped to the same parent (Scenario under the target Project by `Scenario.name`; Test Group under the matched Scenario by `TestGroup.name`; Test Case under the matched Test Group by `TestCase.name`). Preview computes validation and duplicate matches without writing; confirm performs the writes in one transaction per row-batch, then writes one `ImportLog` row summarizing the run (counts + per-row duplicate resolution) and one `AuditLog` entry per created/updated/skipped record.

**Audit Trail:** Single `AuditLog` table: `entityType`, `entityId`, `action`, `actorId`, `occurredAt`, `oldValue`/`newValue` (JSON), `projectId` (denormalized for fast per-project filtering). Written by the same service-layer functions that perform mutations (not a DB trigger), so every code path that changes tracked data goes through one place. No update/delete API is ever exposed for `AuditLog`. All timestamps stored UTC; UI renders and labels a single fixed time zone (exact zone TBD — not schema-blocking, default UTC-displayed until specified otherwise).

**Dashboard math:** Test Progress = `(count(TestCase where deletedAt IS NULL and testResult != 'NOT_RUN' and <active filters>) / count(TestCase where deletedAt IS NULL and <active filters>)) * 100`, rendered as `0` (not `NaN`/error) when the denominator is 0.

## Testing Decisions

- Test at the seam this repo already has: API route handlers (`src/app/api/**/route.ts`) calling Prisma against a real (test) PostgreSQL database — no mocking Prisma. This matches the one existing route, `src/app/api/posts/route.ts`.
- Cover the hierarchy invariants (BR-001–003, BR-006–008) and the RBAC boundary (Tester's restricted Test Case fields, Viewer's read-only access, cross-project access denial) with integration tests at the route-handler seam, not unit tests on isolated functions.
- Test the Dashboard's Test Progress calculation directly (pure function extracted from the aggregation query) including the zero-Test-Case case.
- Test Import validation and duplicate-resolution logic as pure functions over parsed rows, separately from the file-parsing and DB-write steps.
- Positive and negative cases throughout: e.g. both "valid Project Code saves" and "duplicate Project Code is rejected."

## Out of Scope

- Automation-test execution/integration (running Test Cases automatically).
- External defect-tracker integration (Jira, Azure DevOps, etc.).
- AI-generated Test Cases.
- Full Release/Test Cycle/Environment management (confirmed out of scope for v1 per SRS §2.2).
- Export of Dashboard or lists to Excel/PDF (open in SRS §9.2; not built until requested).
- Localization/i18n (Thai/English) — UI text is single-language for v1.
- SSO/OAuth login — Credentials-only for v1.
- A specific max Import file size/row count and a Performance-testing SLA/target data volume (open in SRS §9.2) — enforce a conservative placeholder limit (10MB / 5,000 rows) in the Import ticket, revisit if specified.

## Further Notes

- Open items from SRS §9.2 not otherwise resolved above (export, localization, file-size/SLA specifics) are listed under Out of Scope rather than blocking the start of work; they don't affect the schema or API shape decided here.
- This spec covers the whole system. See `.scratch/test-management-system/issues/` for the vertical-slice tickets that break it into buildable, demoable increments — start there for implementation order.
