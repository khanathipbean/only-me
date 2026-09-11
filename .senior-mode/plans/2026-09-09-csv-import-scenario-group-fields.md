# CSV/Excel Import: support Scenario & Test Group narrative fields — Plan

Goal: When an import row is the one that creates a new Scenario or Test Group (find-or-create,
per ticket 08's existing container semantics), the container should also get its narrative
fields set from the file — not just its name.

Current vs desired (Diff):
- Now: template/import only ever set Scenario.name + expectedResult (borrowed from the *Test
  Case's* Expected Result column as a fallback) and priority; Scenario.description/preconditions
  and TestGroup.testObjective are always left null, reachable only via the seed script or the
  Edit form.
- Want: 4 new optional columns — **Scenario Description**, **Scenario Preconditions**,
  **Scenario Expected Result**, **Test Group Objective** — populate those fields when a row
  triggers creation of a new Scenario/Test Group. Existing CSVs without these columns keep
  working unchanged (Scenario Expected Result falls back to the row's own Expected Result,
  exactly like today; the other 3 stay null as today).

Out of scope / do NOT touch (Fence):
- Ticket 08's deliberate scope decision that Scenario/Test Group are never flagged as duplicates
  and have no per-row resolution UI — unchanged. These new columns only ever apply at the moment
  of creation; if the Scenario/Test Group already exists, the columns are silently ignored for it
  (matching how Scenario Name/Test Group Name are already redundantly repeated per row today).
- No changes to Test Case duplicate resolution, ImportLog shape, or the atomic-transaction
  behavior.
- `npm test` is currently blocked in this environment by a Windows Application Control Policy
  on `schema-engine-windows.exe` (unrelated, pre-existing, out of my control) — I'll still write/
  update the automated tests per repo convention, but can't execute `npm test` myself here;
  verification will lean on tsc/lint/build + manual curl against the live dev server + a
  live CSV upload through the actual Import Wizard UI in the browser test flow. I'll say so
  explicitly rather than claim test-passing I can't observe.

Risks & unknowns:
- Naming collision risk: existing column is "Expected Result" (Test Case-level). New column
  "Scenario Expected Result" must be visually distinct enough in the template header and the
  ImportWizard edit form that users don't confuse the two. Mitigated by explicit "Scenario "
  prefix on all 3 new Scenario columns and "Test Group " prefix on the new Test Group column.
- All 4 new fields are optional (not added to `REQUIRED_FIELDS`), so no existing valid row
  becomes invalid.

## Steps
1. `src/lib/import/parse.ts` — add 4 columns to `IMPORT_COLUMNS`, 4 fields to `ImportRow`, extend
   `toRow()`, extend `generateImportTemplateCsv()`'s example row.
   Verify: `tsc --noEmit`.
2. `src/lib/import/service.ts` — in `confirmImport`'s scenario-create branch, use
   `description`/`preconditions` from the new columns (null if blank) and
   `expectedResult: scenarioExpectedResult || data.expectedResult` (fallback preserves old CSVs);
   in the test-group-create branch, set `testObjective` from the new column.
   Verify: read the diff against ticket 08's existing create branches — no change to the
   find-or-create / duplicate logic itself.
3. `src/components/ImportWizard.tsx` — add the 4 new keys to `EDITABLE_FIELDS` so reviewers can
   see/edit them in the preview before confirming.
   Verify: `tsc --noEmit`, then a manual live-browser pass (upload a CSV with the new columns,
   confirm the container ends up with the right description/preconditions/objective via the
   Project/Scenario detail pages).
4. `tests/import.test.ts` — extend the template-columns test (already generic over
   `IMPORT_COLUMNS`, no change needed) and add one new test: importing a row with the new
   columns creates a Scenario/Test Group with description/preconditions/testObjective/
   expectedResult set from those columns; a second row for the *same* (already-existing)
   Scenario/Test Group with different values in those columns does NOT overwrite the container
   (proves "only applies at creation").
   Verify: written for repo convention; cannot run `npm test` myself (see Fence) — ask the user
   to run it, or I'll validate the same behavior manually via curl + the dev DB.
5. Full check: `tsc --noEmit`, `npm run lint`, `rm -rf .next && npm run build`, then a live
   curl/browser pass hitting `/api/import/template` to confirm the new columns appear and a
   real CSV upload through the Import Wizard UI produces the expected Scenario/Test Group.
