# Results recorded outside a round — Plan

Goal: a result recorded anywhere is a fact the history can read, whether or not
it belongs to a Test Run.

Current vs desired (Diff):
- now: `updateTestResultAndNotes` writes only `TestCase.testResult`. It creates
  no event and touches no round, so Problem cases — which queries
  `prisma.testRunCase` — cannot see it. A case marked FAILED outside a round
  shows as failing on the Dashboard, drags its Requirement to IN_PROGRESS, and
  is absent from the one page whose job is naming what is going wrong.
- want: every recording produces an event. An event always has a Test Case and
  optionally a round. The history reads both, and marks recorded outside a
  round are drawn with a white border.

Out of scope / do NOT touch (Fence):
- `TestRunCase` itself. Rounds keep owning their rows and their results; this
  adds a second source, it does not replace the first.
- The ordering of rounds, the pattern rules, the roll-up, the status rule.
- Anything that would make an existing round's history read differently.

Risks & unknowns:
- **The 152 existing `TestRunCase` rows have no events.** Any reader that
  switches to events as its only source empties the strip of everything
  recorded before today. The fallback that draws one mark from the round's own
  result must stay, and must be covered by a test.
- Renaming the model is free only while the table is empty. Production holds 0
  events today (verified). `prisma db push` may still want
  `--accept-data-loss` to drop it — stop and ask rather than pass that flag.
- Mixed ordering: a round is placed by when it was created, an out-of-round
  group by when it was recorded. Picking one key for both changes how existing
  rounds sort. Use the first answer's time, falling back to the round's
  createdAt, and write a test that pins the order.
- Production needs the schema before the code. DB first, deploy second.

## Steps

1. Schema — rename `TestRunCaseEvent` to `TestResultEvent`, add required
   `testCaseId`, make `testRunCaseId` optional. Index both ways.
   files: `prisma/schema.prisma` — verify: `prisma generate`, local `db push`.
2. Writers — `setRunCaseResult` sets both ids; `updateTestResultAndNotes`
   creates an event with no round.
   files: `src/lib/test-runs.ts`, `src/lib/test-cases.ts` — verify: a test that
   records both ways and counts events.
3. Deletes — events hang off the case now, so `purgeTestCases` must clear them
   by `testCaseId`, and `removeCaseFromRun` must only clear the round's own.
   files: `src/lib/hard-delete.ts`, `src/lib/test-runs.ts` — verify: existing
   delete tests still pass.
4. Reader — `RunHistoryEntry.testRunId` becomes nullable; out-of-round events
   are read per case, grouped by day, and merged into the history in time
   order. `toResultMarks` says whether each mark had a round.
   files: `src/lib/run-history.ts` — verify: tests for grouping, ordering, the
   legacy fallback, and a case that only ever failed outside a round.
5. UI — white border on a mark with no round; no link where there is nowhere to
   go; the history panel labels the group by its date.
   files: `src/app/projects/[id]/problem-cases/page.tsx`,
   `src/components/RunHistoryList.tsx` — verify: build, and a look at the page.
6. Production — `prisma db push`, **after asking**, then verify from
   `information_schema` rather than the CLI's own message.
