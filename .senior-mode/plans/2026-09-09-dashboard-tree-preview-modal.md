# Dashboard Hierarchy tree: preview modal instead of instant navigation — Plan

Goal: In the Dashboard's Hierarchy tree (`TreeWidget` in `src/components/DashboardView.tsx`),
clicking a Scenario/Test Group/Test Case name opens a preview modal with that item's details,
instead of navigating away immediately. The modal has a "View full page" button that does the
actual navigation.

Current vs desired (Diff):
- Now: Scenario/Test Group names are `<Link href=...>` inside `TreeRow`; a Test Case leaf name
  is a `<Link>` wrapping the name + result Badge. Clicking any of them navigates immediately.
- Want: clicking the name opens a modal fetching and showing that item's real fields (not just
  the name+count already visible in the tree row), with a "View full page" button/link that
  navigates using the same href as before, plus a Close button.

Out of scope / do NOT touch (Fence):
- The Overview widget's `MeterRow` buttons (By Test Result/Priority/Assignee) — those already do
  filter drill-down on click, a different, unrelated feature. Not touched.
- The expand/collapse chevron button on Scenario/Test Group rows — stays exactly as-is (separate
  element from the name, no behavior change).
- Any other list page (`/projects/[id]/scenarios`, `/test-groups`, etc.) — this change is scoped
  to the Dashboard's Hierarchy tree only, per the request ("หน้า dashboard").
- The existing `src/components/ui/Modal.tsx` (used for +New/Edit everywhere else) — it's an
  uncontrolled component that renders its own trigger button, which doesn't fit "one shared modal,
  opened by clicking any of many different tree rows, with per-open fetched content." Building a
  new small controlled dialog component instead, rather than changing Modal's contract for its 8
  existing call sites.

Risks & unknowns:
- The dashboard tree API already carries Scenario/Test Group name+count and Test Case
  name+testResult+priority+assignee — not enough for a genuinely useful preview (no description/
  preconditions/expected result/etc. for Scenario or Test Group). Fix: fetch full details on
  demand from the *existing* `GET /api/scenarios/:id`, `GET /api/test-groups/:id`,
  `GET /api/test-cases/:id` routes when the modal opens (already used by other pages; return
  full flat records, and for Test Case also nested `steps`/`attachments`). No new API needed.
- Client-side `fetch` to these routes needs the session cookie — already proven to work as-is
  in this same file's existing `fetchDashboard`, so no auth config required.

## Steps
1. Add `PreviewTarget` state (`{ type: "scenario" | "testGroup" | "testCase"; id: string; href: string } | null`)
   to `DashboardView`. Files: `src/components/DashboardView.tsx`. Verify: `tsc --noEmit`.
2. Change `TreeRow`'s name element from `<Link href={href}>` to a `<button type="button">` that
   calls `onPreview({...})` instead of navigating; same for the Test Case leaf row. Keep the
   expand/collapse chevron and result Badge exactly as they render today. Files: same.
   Verify: `tsc --noEmit`, then confirm via curl/browser that the tree still renders identically
   (same classNames, just a button instead of an anchor).
3. New component `PreviewModal` (in `DashboardView.tsx`, dashboard-only per Fence): a controlled
   `<dialog>` (open/close driven by `target` prop, not an internal trigger button — mirrors
   `Modal.tsx`'s visual chrome: `m-auto`, backdrop, header with title + close IconButton). On
   `target` change, fetches `/api/{scenarios|test-groups|test-cases}/{id}` and renders
   Loading/Error(+Retry)/Data states, matching this file's existing per-widget state convention.
   Data view per type:
     - Scenario: Priority/Status badges, Description, Preconditions, Expected Result, Tags
     - Test Group: Objective, Description, Status
     - Test Case: Priority/Status/Test Result badges, Preconditions, Test Data, Expected Result,
       ordered Test Steps, Assignee
   Footer: `LinkButton href={target.href}>` (View full page) + Close.
   Verify: `tsc --noEmit`, `npm run lint`.
4. Wire `PreviewModal` into `DashboardView`'s render, passing the `PreviewTarget` state and a
   close handler (also fired on the dialog's native `close`/Escape event, to keep state in sync).
5. Full check: `tsc --noEmit`, `npm run lint`, `rm -rf .next && npm run build`, then a live
   curl/browser pass against the running dev server: open the Dashboard, click a Scenario, Test
   Group, and Test Case name each, confirm the modal shows real fetched fields (not just
   name+count), and confirm "View full page" navigates to the same page the old Link did.
