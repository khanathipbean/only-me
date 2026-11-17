# Resources: links beside notes — Plan

Goal: a project can keep links to things that live outside this app, on the
same page as its Notes, reached by a switcher between the two.

Current vs desired (Diff):
- now: `/projects/<id>/notes` is a Notes list; a URL typed anywhere in the app
  is plain text that nobody can click. The nav calls the tab "Notes".
- want: the same route holds two views — Notes and Links — chosen by the same
  `ViewTabs` control My Work uses. A link's title opens the address in a new
  browser tab. The nav tab is renamed, because the page is no longer only
  notes.

Out of scope / do NOT touch (Fence):
- The Files page and `ProjectFile`. They stay exactly where they are; this is
  not the merge of Files into Resources.
- `Note`, `src/lib/notes.ts` and the Notes view's own markup: a reader on the
  Notes tab must see no change at all.
- The route itself stays `/projects/<id>/notes`. Renaming it would touch the
  Overview's Recent notes card, the breadcrumb helpers and two e2e specs for
  no behaviour anyone asked for.
- Supabase and the production database. The migration runs where the user
  says and not before.

Risks & unknowns:
- A pasted address is untrusted input. `javascript:` and `data:` URLs must be
  refused by the server, not merely left out of the form — an `<a href>` the
  app renders is the app's own origin.
- `rel="noopener noreferrer"` on every outward link, or the page opened can
  reach back at the tab it came from.
- Capabilities: the page is one page, so it keeps one pair — `notes.view` and
  `notes.write`. Renaming those keys would orphan the `RolePermission` rows
  that already name them, and buy nothing.

## Steps

1. `Link` model + migration — files: `prisma/schema.prisma`,
   `prisma/migrations/*` — verify: `prisma migrate dev` on the local database
   only; `npx tsc --noEmit` sees the generated client.
2. The data layer — files: `src/lib/links.ts` — verify: unit tests in step 6.
3. Catalogue and nav wording — files: `src/lib/permissions.ts`,
   `src/components/ProjectTabs.tsx`, `src/lib/breadcrumb.ts` — verify:
   `tests/permissions.test.ts` still passes (it compares role arrays by
   identity, so a label change must not move a rule).
4. The switcher and the Links view — files:
   `src/app/projects/[id]/notes/page.tsx`, a new
   `src/components/LinksView.tsx` — verify: screenshot both tabs.
5. Outward links render safely — inside step 4 — verify: step 6's test for a
   refused scheme, and the rendered `rel`.
6. Tests — files: `tests/links.test.ts` — verify: each one fails when its
   guard is removed, not merely passes.
