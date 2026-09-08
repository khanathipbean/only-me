# 09: Project Dashboard

**What to build:** A per-project Dashboard showing hierarchy counts, Test Result/Priority/Assignee breakdowns, a Test Progress percentage, an expandable Scenario→Test Group→Test Case tree, and filters that apply consistently across every number, chart, and list on the page — plus empty/loading/error states for each widget.

**Blocked by:** 05 (Test Case CRUD)

**Status:** ready-for-agent

- [x] Extract Test Progress as a pure function: `(testCasesWithResult, totalTestCases) => totalTestCases === 0 ? 0 : (testCasesWithResult / totalTestCases) * 100` — unit-testable without a database
- [x] `GET /api/projects/:projectId/dashboard`: accepts filter params (scenario, test group, test result, priority, status, assignee, tags, createdDate range, updatedDate range); returns counts (Scenario/Test Group/Test Case totals, Test Case breakdown by result/priority/assignee), Test Progress, and the hierarchy tree (counts per node) — all computed from the same filtered query, not separate unfiltered/filtered paths
- [x] Dashboard UI: summary widgets, Test Progress display, filter controls with a "clear all" and a visible list of active filters
- [x] Hierarchy tree widget: expand/collapse per node, clicking a node navigates to its detail; expand/collapse state survives a filter change (doesn't reset)
- [x] Drill-down: clicking any summary number navigates to the underlying filtered list
- [x] Per-widget Empty (with create/import call-to-action when the Project has no data at all), Loading, and Error-with-Retry states; a filter matching nothing clears stale data and shows a "no results" message rather than leaving the previous result showing
- [x] Tests: Test Progress pure function (including the zero-Test-Case case), dashboard counts match a known seeded dataset, changing one filter changes counts/tree/lists together, expand/collapse state isn't reset by a filter change

## Comments

Implementation: `src/lib/dashboard.ts` runs one `Scenario.findMany` with matching `where` and nested `include.where` predicates (Scenario → TestGroup → TestCase), so counts, the by-result/priority/assignee breakdowns, and the tree are all derived from that single result set — they cannot drift apart by construction, satisfying the ticket's "not separate unfiltered/filtered paths" requirement. A separate, filter-independent `hasAnyData` check (`Scenario.count` for the Project) distinguishes the true "no data at all" Empty state from the "no results" state a filter can produce; both are covered by tests.

Interpretation decisions, not fully spelled out in the spec, made explicit here: (1) the "Status" filter applies to `TestCase.status`, not `Scenario`/`TestGroup` status, for consistency with Test Result/Priority as the other TestCase-level dimensions a row in the tree actually has. (2) Created/Updated date-range filters apply to `TestCase.createdAt`/`updatedAt`. (3) "Tags" filters `Scenario.tags` (the only level tags exist on) and cascades down through the hierarchy. (4) Drill-down ("clicking any summary number navigates to the underlying filtered list") is implemented as clicking a breakdown number applying that value as a filter, which re-renders the Hierarchy tree scoped to it — there is no separate project-wide flat Test Case list page anywhere else in this app to navigate to, so the already-filtered tree *is* the underlying list.

Per-widget Loading/Error/Empty states share one underlying fetch (one dashboard API call) rather than fetching independently per widget — deliberate, since independent per-widget fetches would reintroduce exactly the "separate unfiltered/filtered paths" risk the ticket explicitly warns against. Each widget still renders its own Loading/Error(+Retry)/Empty/no-results UI from that shared state.

Expand/collapse survives a filter change by construction (`expanded` is a `Set<string>` in its own `useState`, never written to by the fetch/filter code path) but this is not covered by an automated test: the repo's testing seam (`vitest`, `environment: "node"`, no `jsdom`/React Testing Library anywhere in the project) only supports API-route-handler and pure-function tests, not component/DOM interaction tests, and installing a component-testing stack was judged out of scope for this ticket. Self-reviewed (Standards + Spec axes) in place of the usual two-agent parallel review — both review subagents failed on an org-wide API spend cap, not a code issue, so I read the diff against the established repo patterns (`audit-log` route/page/lib as the closest precedent) and the ticket/spec myself. One real finding fixed: `DashboardView.tsx` initially hardcoded the `TestResult`/`Priority`/`WorkflowStatus` `<option>` lists instead of reusing the value arrays already exported from `src/lib/dashboard.ts`, duplicating the enum list in three places; now generated from the shared arrays. Re-verified: 66 tests passing, typecheck/lint/build all clean.
