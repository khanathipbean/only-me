# Requirement traceability in the Hierarchy panel — Plan

Goal: the Dashboard's Hierarchy panel answers "which requirement is tested,
and how far has it got" — seven columns beside the tree, and the requirements
nothing tests made visible for the first time.
Approved design: the prototype at https://claude.ai/artifact/7cbiiKwMHWt7PQdEG6sTmu

Current vs desired (Diff):
- now: a nested list; each row carries a name, a level badge, the Feature tag
  and one count. A requirement with no test cases never appears at all.
- want: the same five levels, plus Requirements · Test Cases · Coverage ·
  Passed · Failed · Not Run · Execution %, each level answering only the
  columns it can; `Has Cases` / `No Cases` on the Requirement row; a line in
  the panel header saying how many requirements have no test cases.

Out of scope / do NOT touch (Fence):
- the Overview widget above it. Its stat tiles, Problem Cases strip, By Test
  Result, By Priority and Test Runs stay exactly as they are — the user asked
  for the Hierarchy part only.
- the filter bar, the dashboard route, and `getProjectDashboard`'s existing
  figures (`counts`, `testProgress`, `testCasesByResult`, `coverage`,
  `attention`, `runProgress`). New fields are added beside them; none change.
- Table view and the "copy" button from the prototype: never chosen, not built.

Risks & unknowns:
- Uncovered requirements cannot be counted while a case-level filter is on —
  a requirement with no cases cannot match a filter about cases, so the figure
  would read 0 and look like good news. The panel must say so instead.
- The tree is built from scenarios that survived the filters; adding
  requirements from the other direction must not resurrect ones a structural
  filter excluded.
- Skipped and blocked have no column, so Passed + Failed + Not Run will not
  add up to Test Cases. The row's tooltip says how many are missing.

## Steps

1. `src/lib/dashboard.ts` — a `results` roll-up on every node (total, passed,
   failed, notRun, other, recorded), requirement counts on the module node,
   and `requirementCoverage` for the header line. verify: unit tests.
2. Same file — merge in requirements that have no live test cases, only when
   no case-level filter is on. verify: a unit test for each direction.
3. `src/components/DashboardView.tsx` — the panel becomes a table: flatten the
   tree to the visible rows, keep the twisty, the preview navigation and the
   Feature tag. verify: e2e.
4. The header line and the `Has Cases` / `No Cases` filter. verify: e2e.
5. `npm run build` into `.next-build`. The user starts the server.
