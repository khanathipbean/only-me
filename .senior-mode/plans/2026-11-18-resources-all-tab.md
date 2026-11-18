# Resources: Files moves in, and an All tab — Plan

Goal: one Resources page holding Notes, Files and Links, opening on an All
view that lists the three together, newest first.

Current vs desired (Diff):
- now: the nav has a Resources tab at `/projects/<id>/notes` (Notes + Links,
  two pills) and a separate Files tab at `/projects/<id>/files`.
- want: one nav tab at `/projects/<id>/resources` with four pills — All,
  Notes, Files, Links. Files keeps its own page, its own `files.view` check
  and its own upload form; only where you reach it from changes.

Out of scope / do NOT touch (Fence):
- How any of the three existing lists look. Notes keeps its table, Files
  keeps its upload card and its preview cards, Links keeps its table. This
  moves them and adds a fourth view; it does not redesign them.
- The file download/preview API route, `/api/projects/<id>/files/<fileId>`.
- The `Note`, `Link` and `ProjectFile` tables. No migration: All reads what
  is already there.
- Supabase and the production database.

Risks & unknowns:
- Three capabilities now meet on one page. `notes.view` and `files.view`
  stay separate: the Files pill is hidden without `files.view`, and All must
  leave file rows out for the same reader. Hiding is not the guard — the
  Files page keeps checking for itself.
- All pages three tables at once. No single SQL query can do it, so the rows
  are merged in memory. Fine at hundreds; a debt to write down, not to hide.
- `ProjectFile` has no `feature` column, so the Feature filter cannot apply
  to it. On All the filter is not offered at all, rather than offered and
  silently dropping every file.
- Old addresses are in people's bookmarks and in the Overview's cards.
  `/notes` and `/files` must keep working.

## Steps

1. The routes — files: `src/app/projects/[id]/resources/{page,notes,files,
   links}` moved from their old homes, plus redirects left at `/notes` and
   `/files` — verify: every old address still lands somewhere sensible.
2. The All view and its data layer — files: `src/lib/resources.ts`,
   `src/app/projects/[id]/resources/page.tsx` — verify: unit test for the
   merge and the ordering; a browser spec for the list.
3. The switcher grows to four — files: `ResourceTabs.tsx` — verify: the
   Files pill is absent without `files.view`.
4. Everything that points at the old addresses — files: `ProjectTabs.tsx`,
   `breadcrumb.ts`, `hrefs.ts`, `ProjectOverviewSummary.tsx`,
   `ProjectQuickActions.tsx`, `project-files.ts` — verify: `tsc`, and no
   `/notes` or `/files` left outside the redirects.
5. Tests — files: `tests/resources.test.ts`, `e2e/resources-links.spec.ts`,
   `e2e/missing-file.spec.ts`, `e2e/filters-survive-errors.spec.ts`,
   `e2e/overview-rows.spec.ts`, `e2e/dev-role.spec.ts` — verify: each new
   test fails when its subject is removed, then the whole suite passes.
