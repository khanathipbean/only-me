# Menu previews with a drawing — Plan

Goal: hovering a nav menu entry shows, beside the list, a small drawing of that
page — a ring for the Dashboard, bars for Problem Cases, a week of activity for
the Audit Trail, the real first lines for Notes, and so on
(design: https://claude.ai/artifact/KSYaRukppJ5U9hDTuyS5Zf).

Current vs desired (Diff): `NavMenu` draws one column of links with a name and a
line of detail → it draws that column plus a preview pane that follows the
pointer (and the keyboard focus) down the list.

Out of scope / do NOT touch (Fence):
- which entries exist, their order, their addresses, who may see them — `ProjectTabs`'
  capability filter and `everyTab` stay as they are.
- the pages themselves. Nothing under `src/app/projects/[id]/**` changes.
- `getProjectDashboard`, `listProblemCases`, `listNotesForProjectPage`,
  `listLinksForProjectPage`, `listProjectFilesByModule` — read nothing into them,
  change nothing in them.
- the Resources "All" view stays hidden but reachable.

Risks & unknowns:
- Cost. The preview must never be paid for by a reader who does not open a menu,
  so it is fetched on first open, not rendered into the layout.
- A client component must not import a *value* from a module that reaches Prisma
  (a Turbopack panic, earlier this session). The payload types therefore live in
  their own import-free file.
- The panel is portalled with fixed coordinates; twice as wide, it can run off
  the right of a narrow window, so it has to be clamped.

## Steps

1. `src/lib/menu-preview-types.ts` — the payload shape, no imports, so both the
   server query and the client drawings can read it. verify: `tsc` passes and
   nothing else is pulled in.
2. `src/lib/menu-preview.ts` — `getMenuPreview(projectId, allowed)`, one focused
   query per section, only for sections the capability list holds. Pure helpers
   (week buckets, module shares) exported for testing.
   verify: `tests/menu-preview.test.ts` against the real test database.
3. `src/app/api/projects/[id]/menu-preview/route.ts` — session, membership,
   `heldBy`, hand back only what that role may see.
   verify: a test asserting a DEV's payload has no `summary` and no `problems`.
4. `src/components/project/MenuPreview.tsx` — the drawings, client, pure, fed the
   payload. One per section plus the at-rest ("nothing here yet") form.
   verify: e2e, by eye against the artboards.
5. `src/components/ui/NavMenu.tsx` — optional `renderPreview`; two-column panel;
   track the pointed-at/focused item; clamp the panel inside the viewport.
   verify: e2e measures the panel's box, as `nav-menus.spec.ts` already does.
6. `src/components/ProjectTabs.tsx` — fetch once on first open, cache, pass the
   renderer down. No fetch until a menu opens.
   verify: e2e asserts no request to the route on load, one after the first open.
7. `e2e/menu-previews.spec.ts` — the preview appears, follows the pointer, is on
   screen, survives an empty project, and the menu still works when the fetch
   fails. Prove each fails when its subject is removed.
8. `npm run build`. The user starts the server.
