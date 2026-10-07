# What a Test Case's rounds say about it — Plan

Goal: find out which cases keep failing, whether they have always failed or
just broke, and what was written down when they did.

Current vs desired (Diff):
- now: a Test Case shows `testResult`, which is the newest round's answer and
  nothing else. What happened in the rounds before it, and the notes typed
  when it failed, are reachable only by opening each round and finding the
  row. Nothing anywhere ranks cases by how badly they are going.
- want: the history beside the case while testing, a count on the list, and a
  report that sorts the project's cases by the shape of their failures.

Three pieces, smallest first:

**C — the history beside the row being tested.** In a Test Run, the expanded
row gains a Run history list: every round this case has been in, oldest
last, the round being worked on marked rather than hidden. This is where the
question "has this failed before?" actually gets asked — a second before
someone types a note.

**B — a Runs column on the Test Cases list.** One number, or a dash. The
dash is the point: `NOT RUN` in the Test Result column today means both
"never in a round" and "in rounds, skipped every time", and only this column
tells them apart. It is also the only view that shows cases no round has
ever reached, which neither C nor the report can.

**The report — Problem cases.** A project-level page grouping cases by
pattern rather than by count, because the three patterns need different
responses: Regression (passed, now failing), Never passed (failed every
round), Unstable (changed its mind more than once), and Recovered, quiet at
the bottom, so a fix can be seen rather than chased. Each row carries the
case's place in the tree, a square per round oldest-first, and the note from
the last failure.

Out of scope / do NOT touch (Fence):
- `TestCase.testResult` and the newest-round rule that maintains it.
- The status rollup.
- No schema change: `TestRunCase` already holds `testResult`, `ranAt`,
  `ranById` and `notes`, and carries `@@index([testCaseId])`.

Risks & unknowns:
- **Archived rounds still own their `TestRunCase` rows.** The Dashboard was
  bitten by this once — 142 cases read as "scheduled" while the rounds on
  screen covered 21. Every query here filters `testRun: { deletedAt: null }`.
- **N+1.** A page shows many cases; history is fetched for all of them in one
  query keyed by `testCaseId: { in: [...] }` and grouped in memory.
- Rounds are ordered by `createdAt` — the same ordering the mirror rule and
  the Dashboard's round picker use, and the only one every round has, since
  `startsOn` is optional.
- Phase scoping is a filter on the report, defaulting to the most recent
  phase, rather than a decision taken for the reader: "fails often" usually
  means now, but not always.

## Steps

1. `src/lib/run-history.ts` (new) — `listRunHistoryForCases(testCaseIds)`
   returning, per case, its rounds oldest-first with result, note, when and
   who. One query. Verify: unit test over a case in three rounds, one of them
   archived and excluded.

2. Wire C into the Test Run page's expanded row, above Attachments.
   Verify: screenshot.

3. B — `_count` of live run-cases on the Test Cases list query, one column
   beside Test Result. Verify: a test that a case in no round reads 0.

4. `classifyPattern(results)` — pure, from the ordered results to
   Regression / Never passed / Unstable / Recovered / Stable. Verify: unit
   tests per shape, which is where this feature is right or wrong.

5. The Problem cases page, its filters, and a nav tab.

6. `npx tsc --noEmit`, `npx eslint`, `npm test`.
