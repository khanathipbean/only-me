# Selecting several cases in a round — Plan

Goal: a Select button on the Test Run page turns on checkboxes, and a panel at
the bottom sets a result on, or removes, everything ticked.

Current vs desired (Diff):
- now: every row carries its own result form and its own Remove; doing the
  same thing to twenty cases is twenty round trips.
- want: tick them, act once.

Out of scope / do NOT touch (Fence):
- The per-row result form stays. This is a second way to do the same thing,
  for when there are many; taking the single-row path away would make the
  common case worse.
- The "Add test cases" dialog and its own filters.
- Selection across pages — see the risk below.
- Netlify, and the deployed database.

Risks & unknowns:
- **`removeCaseFromRun` never checked `ranAt`.** "Don't remove a case whose
  result is recorded" lives only in the JSX that decides whether to render the
  button. A panel button belongs to no row, so that protection disappears the
  moment this feature exists — and removing a case deletes its result and its
  attachments, from storage as well as the database. The rule moves into the
  function first, as its own commit.
- Selection is per page. The page is paginated, and a count on a button that
  doesn't match what the button will touch is the worst bug this feature can
  have.
- A closed round shows no Select button at all: results are read-only there,
  so offering the mode and then refusing is worse than not offering it.

## Steps

1. `src/lib/test-runs.ts` — `removeCaseFromRun` refuses a case with `ranAt`
   set, with a message saying why. Verify: a test that records a result and
   then fails to remove the case, and one that removes an unrun case still.

2. `src/lib/test-runs.ts` — `removeCasesFromRun(runId, ids, actorId)` and
   `setRunCaseResults(runId, ids, result, actorId)`, both looping the existing
   single-case functions so the result mirror and the attachment cleanup keep
   working exactly as they do now. Remove reports what it skipped.
   Verify: a test over a mixed selection — some run, some not.

3. `src/components/RunCaseSelection.tsx` (new, client) — holds the ticked ids,
   renders the checkbox column and the panel. Takes the rows it may select and
   the two server actions.
   Verify: screenshot of the panel with a mixed selection.

4. `runs/[runId]/page.tsx` — wire it: Select button (open runs only), checkbox
   cell per row, bound actions.

5. `npx tsc --noEmit`, `npx eslint`, `npm test`.
