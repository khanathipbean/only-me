# Project Notes page — Plan

Goal: a Project tab where a member writes a plain-text note filed under a Module, and finds it
again from the global search.

Current vs desired (Diff): today the only place to keep prose against a Module is uploading a
file to the Files tab (`ProjectFile.moduleId`), which cannot be written in-app, cannot be
searched by content, and has no date of its own → a `Note` record with a title, a body, an
optional date it happened, and a required Module, listed on its own tab and indexed by
`searchAll`.

Decisions already made by the user (do not revisit):

- Filed under a **Module**, not a Feature. `Requirement.feature` is a free-text label on
  Requirement (`schema.prisma:452`), not a table, so nothing can hold a foreign key to it.
- Body is **plain text**. Stored as typed and rendered as typed via `whitespace-pre-wrap`.
  Nothing parses it as Markdown, so the stored-XSS route that keeps SVG out of
  `INLINE_TYPES` (`project-files.ts:12`) never opens here.
- **Found by the global search**, matching on title *and* body.
- Visible to **every member of the Project** — the app's normal rule, no per-note privacy.

Layout: **A (table with expandable rows)** from the published studies, unless the user says B.
Only step 5 changes if they do; the model, migration, lib, RBAC and search are identical
either way.

## Out of scope / do NOT touch (Fence)

- `ProjectFile` and the Files tab. Notes sit beside it, nothing migrates out of it.
- `Requirement.feature`, and any idea of making Feature an entity.
- Markdown rendering anywhere, including the separate `.md` preview question still open.
- `Notification` — no new `NotificationType`. A note is written by the person reading the
  page; nobody needs telling.
- The seven existing tabs' order, just settled in `2f07ebb`.
- `searchAll`'s missing `take` — a real issue, but a separate one. Do not fix it here, and do
  not make Notes worse than the six types beside it.

## Risks & unknowns

- **Search cost.** Notes is the first type matched on a long text column. `contains` on
  `body` is a sequential scan; at this data size that is fine, but it is the first query here
  that would not be. Note it in the code rather than pre-optimising.
- **Tab count.** An eighth tab at phone width pushes the nav further into horizontal scroll.
  It already scrolls; verify it has not become unusable.
- **Migration.** The database is shared with whoever else pushes. `prisma db push` against
  Supabase is a dangerous action — ask before running it, and use
  `DATABASE_URL=$DIRECT_URL` for that one command per the note in `prisma7.config.ts:20`.

## Steps

1. **Schema** — add `model Note` (id, projectId, moduleId, title, body, occurredOn?,
   createdById, createdAt, updatedAt, deletedAt?) with `@@index([projectId, moduleId])` and
   back-relations on Project, Module, User. Files: `prisma/schema.prisma`.
   Verify: `npx prisma validate`, then `prisma generate` and confirm
   `src/generated/prisma/models/Note.ts` exists.

2. **Migration** — ask the user first, then push to the real database.
   Verify: query `information_schema.tables` for `Note`, as was done for `Notification`.

3. **Lib** — `src/lib/notes.ts` modelled on `modules.ts`: `listNotesForProjectPage`
   (paginated, filters: search/moduleId/archived), `getNoteById`, `createNote`, `updateNote`,
   `setNoteDeletedAt` + `archiveNote`/`restoreNote`, each writing an `AuditLog` through
   `writeAuditLog`/`setDeletedAt`. A `NoteValidationError` for an empty title or missing
   Module. Files: `src/lib/notes.ts`.
   Verify: `tests/notes.test.ts` covers create/rename/archive/restore, the validation errors,
   and that the list excludes archived rows by default.

4. **Href helper** — `notesListHref(projectId)`. Files: `src/lib/hrefs.ts`.

5. **Page** — `src/app/projects/[id]/notes/page.tsx` following `modules/page.tsx`: Breadcrumb,
   PageHeader with a `+ New Note` Modal, FilterForm (search, Module, Show), `ExpandableRow`
   table, Pagination, `RowActions`. Server actions each call `invalidateRouteCache()` first
   and `requireProjectRoleOrNotFound(userId, id, EDITOR_ROLES)` for writes,
   `ALL_MEMBER_ROLES` for the page itself. A `NoteForm` in `src/components/forms/`.
   Verify: screenshot the page in the running app — signed in, so ask the user to confirm, or
   drive it through the e2e fixture.

6. **Tab** — add `Notes` between `Test Runs` and `Files`. Files:
   `src/components/ProjectTabs.tsx`.
   Verify: nav still fits at 1440 / 900 / 430 with no clipped labels.

7. **Search** — add `"Note"` to `SearchResultType`, a `prisma.note.findMany` with
   `OR: [{ title }, { body }]` scoped to `memberProjectIds` and `deletedAt: null`, and a
   result whose `position` is the Module name. Add the group to `HeaderSearch`'s `GROUPS`
   with a `viewAllHref` (Notes *do* have a per-Project list, unlike Requirements and below).
   Files: `src/lib/search.ts`, `src/components/HeaderSearch.tsx`.
   Verify: `tests/search.test.ts` — a note found by a word that appears only in its body, and
   a note in a Project the user is not a member of NOT found.

8. **Full check** — `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`.

## How to run it

Inline and sequential. Every step builds on the one before (schema → client → lib → page), and
steps 5-7 all touch code that depends on step 3's exports. Nothing here is parallelisable
without conflicts.
