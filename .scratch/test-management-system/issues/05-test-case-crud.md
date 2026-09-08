# 05: Test Case CRUD (multi-step, RBAC field-restriction)

**What to build:** Within a Test Group, a QA Lead can create and manage Test Cases with multiple ordered Test Steps; a Tester can update Test Result/Notes/Attachments but nothing else. This completes the four-level hierarchy the Dashboard, Import, Search, and Move tickets all depend on.

**Blocked by:** 04 (Test Group CRUD)

**Status:** ready-for-agent

- [ ] Prisma models: `TestCase` (`id` auto, `testGroupId`, `name`, `condition?`, `preconditions?`, `testData?`, `expectedResult`, `priority` enum, `testType?` enum `POSITIVE|NEGATIVE|BOUNDARY`, `status` enum, `testResult` enum `NOT_RUN|PASSED|FAILED|BLOCKED|SKIPPED` default `NOT_RUN`, `assigneeId?`, `notes?`, `deletedAt?`, `createdById`, `updatedById`, audit timestamps), `TestStep` (`id`, `testCaseId`, `sequence`, `step`, `expectedResult`), `Attachment` (`id`, `testCaseId`, `url`/`storageKey`, `fileName`, `uploadedById`, `uploadedAt`) — storage mechanism (local disk vs object storage) decided during implementation, not schema-blocking
- [ ] `POST /api/test-groups/:testGroupId/test-cases`: requires `name`, at least one `TestStep`, and `expectedResult`; `testResult` always starts `NOT_RUN`; requires `ADMIN`/`QA_LEAD`
- [ ] `GET /api/test-groups/:testGroupId/test-cases` and `GET /api/test-cases/:id`: full detail including ordered Test Steps, current Test Result, assignee, notes, attachments
- [ ] `PATCH /api/test-cases/:id`: full-field edit for `ADMIN`/`QA_LEAD`; for `TESTER`, only `testResult`, `notes`, and attachment operations succeed — any other field in the request body is rejected (400), not silently ignored; every update stamps `updatedById`
- [ ] `POST /api/test-cases/:id/duplicate`, `.../archive`, `.../restore`, `DELETE /api/test-cases/:id` (confirm required), `PATCH /api/test-cases/:id/assignee`
- [ ] Attachment upload/list endpoint scoped to a Test Case
- [ ] Test Case Detail UI: steps (with per-step expected result), current result, assignee, notes, attachments; Tester sees only the result/notes/attachment controls as editable, everything else read-only
- [ ] Create/Edit Test Case UI (QA Lead): dynamic Test Step list (add/remove/reorder steps)
- [ ] Tests: create requires name/steps/expectedResult, new Test Case defaults to `NOT_RUN`, Tester's attempt to edit a restricted field is rejected while `testResult`/`notes` succeed, `updatedById`/timestamp recorded on every update, duplicate/archive/restore/delete-with-confirm, non-member 403
