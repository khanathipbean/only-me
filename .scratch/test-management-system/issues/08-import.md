# 08: Import (Excel/CSV)

**What to build:** A QA Lead picks a destination Project, uploads an Excel/CSV file, previews validated rows (with per-row errors and duplicate-resolution choices), and confirms — writing Scenarios/Test Groups/Test Cases in one transaction and producing an Import Summary + `ImportLog`. Nothing is written until the explicit confirm step.

**Blocked by:** 05 (Test Case CRUD) — needs the full hierarchy's create paths to reuse

**Status:** ready-for-agent

- [ ] Prisma model `ImportLog`: `id`, `projectId`, `performedById`, `occurredAt`, `succeededCount`, `failedCount`, `skippedCount`, `details` Json (per-row outcome + duplicate-resolution choice)
- [ ] `GET /api/import/template`: downloadable Excel/CSV template with the documented columns (Project Code, Scenario Name, Test Group Name, Test Case Name, Preconditions, Test Steps, Expected Result, Priority)
- [ ] `POST /api/projects/:projectId/import/validate`: accepts an uploaded file; rejects wrong file type or size over a placeholder 10MB limit; parses rows and, for each, returns pass/fail with row number, field, and reason on failure; for passing rows, flags any that match an existing Scenario/Test Group/Test Case by name under the same parent (per spec's dedup rule) as a potential duplicate; **writes nothing**
- [ ] Import Preview UI: shows validation results per row, lets the user fix a row's data inline or mark it "skip", and for flagged duplicates lets the user choose Skip/Update/Create-as-New per row or apply one choice to all flagged rows
- [ ] `POST /api/projects/:projectId/import/confirm`: takes the reviewed/edited rows + duplicate choices; creates/updates records in one transaction; writes one `AuditLog` entry per created/updated/skipped record and one `ImportLog` row summarizing the run; returns succeeded/failed/skipped counts
- [ ] Import Summary UI: shows the counts returned by confirm
- [ ] Tests: template download returns the expected columns, oversized/wrong-type file rejected before parsing, invalid row reports row/field/reason without blocking valid rows, duplicate detection matches by name-under-same-parent, validate performs zero writes, confirm is atomic (a mid-batch failure leaves no partial rows) and produces accurate summary counts, `ImportLog` records the resolution choices made
