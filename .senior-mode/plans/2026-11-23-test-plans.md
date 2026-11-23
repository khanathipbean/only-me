# Test Plans — Plan

Goal: a Test Plan groups several Test Runs under one phase of a project, with a
scope chosen from the test cases that already exist, and a progress figure read
from the runs beneath it.
`Project → Test Plan (Phase) → Test Runs → Test Cases`

## What already exists (the spec asked for this check first)

| The spec asks for | The app already has | Verdict |
|---|---|---|
| Phase | `TestRun.phase String?` — free text, indexed, with `listPhasesForProject`, a filter on the Dashboard, on Problem Cases and on the Runs list | **Reuse.** A Plan carries the same label; nothing about the existing filters changes |
| §7 "one case in several runs → the latest run's result wins" | `resolvePhaseResults` in `src/lib/dashboard.ts` does exactly this, oldest round first so each later report overwrites | **Reuse** — extract it from that file and share it |
| Choosing cases by Module / Requirement / Scenario / Group / Case | `listCandidateCases` + `CasePicker` + `addCasesToRun` (one batch insert, built that way because a row-at-a-time loop already timed out the CSV import once) | **Reuse** all three |
| Pass / Fail / Not Run per run | `summariseRunResults`, `summariseRunScope`, `TestRunCase`, `TestResultEvent` | **Reuse**; write nothing new that records results |
| Progress of a round | `DashboardRunProgress` — total, recorded, byResult | **Reuse** the shape, so Plan progress and Run progress are read the same way |
| Search / filter / sort / pagination on a list | `paginate` in `src/lib/pagination.ts`, `FilterForm`, the Runs list page | **Reuse** |
| Status pills, summary cards, empty / loading / error | `Badge`, `Stat`, `Card`, the Runs list | **Reuse** |
| Audit of create / update / archive | `AUDIT_ACTIONS` already has every verb needed | **Reuse** |

Nothing in §1–§9 needs a new way of recording a result, and nothing needs a
change to the five levels. The new parts are: one table for the plan, one join
table for its scope, one optional column on `TestRun`, and the pages.

## Current vs desired (Diff)

- now: rounds are grouped only by a free-text `phase`, and nothing holds an
  objective, an owner, dates, a status or a scope for that phase.
- want: a Test Plan record that holds those, owns a set of test cases, and
  reports progress across every round linked to it.

## Out of scope / do NOT touch (Fence)

- the five levels, the import, and every page under `modules/`.
- recording results: `setRunCaseResult`, `TestResultEvent`, the assign and
  retest workflow, Problem Cases. A plan reads results; it never writes one.
- runs with no plan: every query gains an optional link, never a required one.
- the Overview and Hierarchy widgets on the Dashboard.

## Decisions to take before step 1

1. **Plan versus phase.** The spec gives a Plan a required `Phase` field, so a
   Plan is *inside* a phase rather than being one. That leaves two groupings
   side by side — `TestRun.phase` and `TestRun.testPlanId` — which can
   disagree (a run filed under "Sprint 12" linked to a plan whose phase is
   "Sprint 11"). Options: (a) keep both and copy the plan's phase onto the run
   when it is linked, (b) keep both and leave them independent, (c) drop the
   free-text phase and let the Plan be the only grouping, migrating existing
   phase strings into plans. **Recommend (a)**: nothing existing breaks, the
   two can never disagree, and (c) stays open later.
2. **Is Status set or computed?** §7 defines Completed as "scope finished and
   no case left unpassed", which is a fact about the runs, but Status is also
   a field a person edits. **Recommend**: the person sets it, and the app
   refuses Completed while the scope still holds a case that has not passed,
   saying which. One source of truth, no silent flipping.
3. **Is scope a snapshot or a rule?** Picking a Module expands to its cases at
   the moment of picking. If a case is added to that module next week, does it
   join the plan? **Recommend a snapshot** (what the spec describes), with the
   plan's detail page showing "N new cases in your chosen modules" and a
   button to pull them in. A live rule would change a plan's denominator
   without anyone touching it.
4. **The menu.** §2 asks for `Testing → Test Cases · Test Plans · Test Runs`.
   Test Cases is a top-level tab today, and the five-tab bar plus its hover
   previews were settled two days ago. Moving it is cheap but it is a reversal;
   confirm before doing it.

## Steps

**Phase 1 — the record (no UI)**
1. `prisma/schema.prisma`: `TestPlan` (projectId, name, phase, objective,
   description, environment, build, startsOn, endsOn, ownerId, status,
   deletedAt, timestamps; unique on projectId+name like `TestRun`),
   `TestPlanCase` (planId, testCaseId, unique pair), `TestRun.testPlanId`
   optional with an index. New enum `TestPlanStatus` (DRAFT, IN_PROGRESS,
   COMPLETED, ON_HOLD) — not `WorkflowStatus`, which Requirement, Scenario and
   Test Case share and has no ON_HOLD. One migration.
2. `src/lib/test-plans.ts`: create, update, archive/restore, list with the
   existing `paginate`, scope add/remove built on `addCasesToRun`'s batch
   shape, and `summarisePlan` built on the extracted phase resolver.
   verify: unit tests, including a case in three runs reading as its latest.
3. Extract `resolvePhaseResults` into `src/lib/latest-results.ts` and have
   `dashboard.ts` import it. Nothing else changes.
   verify: the dashboard's existing phase tests still pass.
4. Capabilities `plans.view` (NON_DEV_ROLES) and `plans.manage` (EDITOR_ROLES)
   in `src/lib/permissions.ts`, which puts them on the roles page for free.

**Phase 2 — the pages**
5. `/projects/[id]/plans` — summary cards, table, search, filter, sort,
   pagination, empty state. Built from the Runs list page's parts.
6. Create / edit form, with the scope picker reusing `CasePicker`.
7. `/projects/[id]/plans/[planId]` — information, summary, included cases,
   linked runs, Create Test Run.
8. Test Run integration: an optional Test Plan field on the run form, scope
   prefilled from the plan and still editable, the plan's name shown on the
   run, and linking an existing run without touching its results.

**Phase 3 — navigation and the finish**
9. The `Testing` menu (decision 4), the menu preview for Test Plans, and the
   redirects in §8.
10. e2e: a plan with two runs reports the later result; a run with no plan is
    untouched; Completed is refused while a case has not passed.
11. `npm run build`, then the migration against Supabase — in that order, and
    the deploy only after the migration, or every plans page 500s.

## Risks

- `src/app/projects/[id]/runs/[runId]/page.tsx` is 1,352 lines and
  `src/lib/test-runs.ts` is 1,041. Step 8 touches both; keep the edits narrow
  and resist tidying on the way past.
- Production needs a migration before the deploy. The `Link` table taught that
  the hard way.
- A plan's summary reads across every run under it. Written naively that is a
  query per run; it has to be the grouped shape `runProgress` already uses.

## Size

Roughly: phase 1 one working session, phase 2 two, phase 3 one — on the
assumption that the four decisions above are settled first. Phase 2 is the
largest and splits cleanly at step 7, so the list and the form can ship before
the detail page exists.
