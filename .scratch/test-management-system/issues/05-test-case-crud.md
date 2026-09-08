# 05: Test Case CRUD (multi-step, RBAC field-restriction)

**What to build:** Within a Test Group, a QA Lead can create and manage Test Cases with multiple ordered Test Steps; a Tester can update Test Result/Notes/Attachments but nothing else. This completes the four-level hierarchy the Dashboard, Import, Search, and Move tickets all depend on.

**Blocked by:** 04 (Test Group CRUD)

**Status:** ready-for-agent

- [x] Prisma models: `TestCase` (`id` auto, `testGroupId`, `name`, `condition?`, `preconditions?`, `testData?`, `expectedResult`, `priority` enum, `testType?` enum `POSITIVE|NEGATIVE|BOUNDARY`, `status` enum, `testResult` enum `NOT_RUN|PASSED|FAILED|BLOCKED|SKIPPED` default `NOT_RUN`, `assigneeId?`, `notes?`, `deletedAt?`, `createdById`, `updatedById`, audit timestamps), `TestStep` (`id`, `testCaseId`, `sequence`, `step`, `expectedResult`), `Attachment` (`id`, `testCaseId`, `url`/`storageKey`, `fileName`, `uploadedById`, `uploadedAt`) — storage mechanism (local disk vs object storage) decided during implementation, not schema-blocking
- [x] `POST /api/test-groups/:testGroupId/test-cases`: requires `name`, at least one `TestStep`, and `expectedResult`; `testResult` always starts `NOT_RUN`; requires `ADMIN`/`QA_LEAD`
- [x] `GET /api/test-groups/:testGroupId/test-cases` and `GET /api/test-cases/:id`: full detail including ordered Test Steps, current Test Result, assignee, notes, attachments
- [x] `PATCH /api/test-cases/:id`: full-field edit for `ADMIN`/`QA_LEAD`; for `TESTER`, only `testResult`, `notes`, and attachment operations succeed — any other field in the request body is rejected (400), not silently ignored; every update stamps `updatedById`
- [x] `POST /api/test-cases/:id/duplicate`, `.../archive`, `.../restore`, `DELETE /api/test-cases/:id` (confirm required), `PATCH /api/test-cases/:id/assignee`
- [x] Attachment upload/list endpoint scoped to a Test Case
- [x] Test Case Detail UI: steps (with per-step expected result), current result, assignee, notes, attachments; Tester sees only the result/notes/attachment controls as editable, everything else read-only
- [x] Create/Edit Test Case UI (QA Lead): dynamic Test Step list (add/remove/reorder steps)
- [x] Tests: create requires name/steps/expectedResult, new Test Case defaults to `NOT_RUN`, Tester's attempt to edit a restricted field is rejected while `testResult`/`notes` succeed, `updatedById`/timestamp recorded on every update, duplicate/archive/restore/delete-with-confirm, non-member 403

## Comments

Prefactor: renamed `ScenarioPriority` to a shared `Priority` enum (TestCase reuses the identical 4 values), same reasoning as ticket 04's `WorkflowStatus`.

Code review (Standards + Spec axes) found no security bugs this time (unlike tickets 02/04) — every RBAC boundary held (create/duplicate/archive/restore/delete/assignee all EDITOR-only, attachments open to Testers per spec story 39, PATCH's Tester field-restriction rejects any non-`testResult`/`notes` key). Spec review did find the Create/Edit UI's Test Step list was a "one line per step" textarea, not the dynamic add/remove/reorder list the ticket's own checkbox demands — replaced with a real client component (`src/components/TestStepEditor.tsx`) submitting structured JSON, parsed server-side by `parseStepsJson`. Standards review found the PATCH route re-fetched `ProjectMembership` a second time even though `withEntityProjectRole`'s wrapper had already fetched and discarded it one call earlier — fixed by having `checkProjectRole` (and both wrappers in `src/lib/api-auth.ts`) return the resolved `membership` alongside `projectId` instead of throwing it away. Also confirmed the archive/restore/delete-with-audit-log triplet had reached its 3rd near-identical copy (Scenario, Test Group, Test Case) and extracted it into `src/lib/soft-delete.ts`'s `setDeletedAt`, used by all three now. Added the two RBAC-sensitive tests the Spec review flagged as unverified (assignee endpoint Tester-rejection, Tester attachment upload). Re-verified: 34 tests passing, typecheck/lint/build all clean.
