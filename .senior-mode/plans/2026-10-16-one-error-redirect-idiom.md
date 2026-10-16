# One way to send a reader back to a list with an error — Plan

Goal: every error redirect carries the filters the reader had set, and says so
the same way.

Current vs desired (Diff):
- now: ten error redirects, each assembling its own URL. Six of them throw the
  reader's filters away; a seventh, in the same file as two of the six, does it
  correctly.
- want: one helper, used everywhere, that keeps the query the page already
  computed.

## What is actually broken, and what is only untidy

Checked each page's `searchParams` rather than assuming:

**Real: `projects/page.tsx`** has `search`, `status`, `archived`, `overdue`.
Its row actions carry them (lines 176-179). Its `create` action does not
(119, 140). Filter the list, add a project whose code is taken, and the list
comes back unfiltered with the message.

**Real: `projects/[id]/files/page.tsx`** has `search` and `moduleId`. All four
of its redirects drop them — the two error paths and, for the same reason,
the two success ones. Upload a file while filtered to one Module and the
filter is gone when the toast arrives.

**Untidy only:** `login`, `projects/new`, `projects/[id]/edit`, `members`, and
the Test Case detail page have no list filters to lose (`error`, `userId`,
`fileId`, `moveError` and `attachmentError` are not filters). Changing these
fixes no bug; it leaves one idiom instead of five spellings of it, so the next
page to grow a filter starts from the version that keeps it.

## Why the success redirects in the files page are in scope

They are the same defect in the same file. Repairing the error paths and
leaving the success ones would mean a failed upload keeps your filter and a
successful one does not.

Out of scope / do NOT touch (Fence):
- `withToast` — it already merges into an existing query string
- the server-action preamble (auth + role check), deliberately left duplicated
- every page not in the list above

Risks & unknowns:
- A server action may only close over serialisable values. The helper is
  imported, and what the actions capture stays plain strings — the rule that
  broke the Test Run page once already.
- The Test Case detail page uses three separate error parameters. Each has to
  keep its own name, not be flattened into one.

## Steps
1. `errorHref` in `src/lib/hrefs.ts` — verify: unit tests
2. `projects/page.tsx` create action — verify: the filter survives a duplicate code
3. `files/page.tsx` all four redirects — verify: the filter survives an upload
4. The five untidy-only pages — verify: suite stays green
5. tsc, lint, unit tests, build, browser tests
