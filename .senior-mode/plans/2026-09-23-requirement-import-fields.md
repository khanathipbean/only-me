# Requirement Code / Description / Feature through Import — Plan

Goal: a spreadsheet can set a Requirement's Reference (`code`), Description and
Feature, on the row that creates it *and* on a later re-import of one that
already exists.

Current vs desired (Diff):
- now: `IMPORT_COLUMNS` carries only `Requirement Name`; a created Requirement
  gets `{ projectId, moduleId, name, priority }` and nothing else, and an
  existing one is looked up and reused, never written to. So `code`,
  `description` and `feature` are always null on anything imported — which is
  why people type "REQ-DSD-001" into the name.
- want: three new columns, applied on create, and applied to an existing
  Requirement when the file supplies a value.

Out of scope / do NOT touch (Fence):
- Module, Scenario, Test Group and Test Case behaviour — including the
  "creation-only" rule for Scenario Description / Test Group Objective. Only
  Requirement gains update-on-reimport.
- The duplicate resolution UI (Skip / Update / Create new) — that is about
  Test Cases and is unchanged.
- Netlify, and the deployed database.

Risks & unknowns:
- **A blank cell must not wipe an existing value.** Re-importing an older sheet
  that lacks the columns would otherwise erase every Description in the
  project. Rule: only a non-empty cell writes.
- `export.ts` builds its rows positionally from `IMPORT_COLUMNS`. Adding a
  column without adding the matching value shifts every later column. Both
  change together, in the same commit.
- Same Requirement on many rows: the first row that introduces it wins, which
  is what `firstSeen` already does for every other level.

## Steps

1. `src/lib/import/parse.ts` — add `Requirement Code`, `Requirement Description`,
   `Requirement Feature` to `IMPORT_COLUMNS`; add the three fields to
   `ImportRow` and read them in `toRow`.
   Verify: an old file with none of the three columns still parses, each field
   an empty string (`get()` already returns "" for a missing key).

2. `src/lib/export.ts` — emit the three values, once per Requirement
   (`requirementIntroduced`), mirroring how Scenario Description is emitted.
   Verify: export → import round-trip keeps Reference/Description/Feature.

3. `src/lib/import/service.ts` — carry the three onto `Work`; include them in
   the `createManyAndReturn`; then, for Requirements that already existed,
   update the fields the file supplies where the value actually differs, with
   an `import-update` AuditLog holding old and new.
   Verify: unit test — existing Requirement with an empty description gains one.

4. Surface it: `updatedCounts.requirements` in the return value, and a matching
   clause in `describeCreatedCounts` so the notification says what changed
   rather than only "No new items were created."

5. Tests — prove each fails before the fix:
   - blank cell leaves an existing value alone,
   - non-empty cell overwrites a differing value,
   - unchanged value writes no AuditLog row,
   - export→import round-trip preserves all three.

6. `npx tsc --noEmit`, `npx eslint .`, full `vitest run`.
