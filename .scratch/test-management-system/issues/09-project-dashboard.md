# 09: Project Dashboard

**What to build:** A per-project Dashboard showing hierarchy counts, Test Result/Priority/Assignee breakdowns, a Test Progress percentage, an expandable Scenario→Test Group→Test Case tree, and filters that apply consistently across every number, chart, and list on the page — plus empty/loading/error states for each widget.

**Blocked by:** 05 (Test Case CRUD)

**Status:** ready-for-agent

- [ ] Extract Test Progress as a pure function: `(testCasesWithResult, totalTestCases) => totalTestCases === 0 ? 0 : (testCasesWithResult / totalTestCases) * 100` — unit-testable without a database
- [ ] `GET /api/projects/:projectId/dashboard`: accepts filter params (scenario, test group, test result, priority, status, assignee, tags, createdDate range, updatedDate range); returns counts (Scenario/Test Group/Test Case totals, Test Case breakdown by result/priority/assignee), Test Progress, and the hierarchy tree (counts per node) — all computed from the same filtered query, not separate unfiltered/filtered paths
- [ ] Dashboard UI: summary widgets, Test Progress display, filter controls with a "clear all" and a visible list of active filters
- [ ] Hierarchy tree widget: expand/collapse per node, clicking a node navigates to its detail; expand/collapse state survives a filter change (doesn't reset)
- [ ] Drill-down: clicking any summary number navigates to the underlying filtered list
- [ ] Per-widget Empty (with create/import call-to-action when the Project has no data at all), Loading, and Error-with-Retry states; a filter matching nothing clears stale data and shows a "no results" message rather than leaving the previous result showing
- [ ] Tests: Test Progress pure function (including the zero-Test-Case case), dashboard counts match a known seeded dataset, changing one filter changes counts/tree/lists together, expand/collapse state isn't reset by a filter change
