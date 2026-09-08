# 10: Global Search + Breadcrumb

**What to build:** A global search box finds Projects, Scenarios, Test Groups, and Test Cases by name/code/ID from anywhere in the app, and a breadcrumb shows the user's current position in the hierarchy, preserving prior search/filter state when navigating back up.

**Blocked by:** 05 (Test Case CRUD)

**Status:** ready-for-agent

- [ ] `GET /api/search?q=...`: searches Project (name/code), Scenario (name/id), Test Group (name), Test Case (name/id) scoped to Projects the caller is a member of; each result includes its type, Project name, and hierarchy position
- [ ] Global Search UI: search box available from any page, results list showing type/Project/position, clicking a result navigates to its detail, clear "no results" state
- [ ] Breadcrumb component: renders the current path (e.g. `Projects > Project A > Scenario A > Navigation > TC-001`) on every detail/list page in the hierarchy; each segment is clickable to navigate up
- [ ] Navigating up via the breadcrumb restores the previous page's search term, filters, and list page where the target page supports them (e.g. returning to a Test Group's Test Case list keeps its prior filter)
- [ ] Tests: search across all four entity types returns correct type/position, search respects project membership (no cross-tenant leakage), breadcrumb renders the correct path at each level, breadcrumb back-navigation restores prior list state
