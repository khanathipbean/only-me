# Handing a failure to a Dev and getting it back — Plan

Not a work-distribution feature. A tester finds a case that failed, hands it
to a Dev, the Dev fixes it and says so, the tester retests. That loop, and
nothing else — the words used when it was asked for were "เท่านั้น", twice.

## What already exists, and is not being rebuilt

  TestCase.assigneeId                  in the schema
  PATCH /api/test-cases/:id/assignee   works
  updateAssignee()                     in the library
  dashboard.testCasesByAssignee        already grouped and filterable
  Notification bell, panel, badge      complete

What is missing is a way to set any of it, a way for the Dev to see it, and
a name where there is currently a raw id.

## The role, which is smaller than it first looked

`VIEWER` already means "sees everything, changes nothing", and every page a
VIEWER reaches has already been judged safe for a member who cannot edit. So:

  DEV = VIEWER + may change the work state of a case assigned to them

  enum ProjectRole    + DEV                     (production schema change)
  EDITOR_ROLES        unchanged — DEV not in it
  ALL_MEMBER_ROLES    + DEV
  WORK_STATE_ROLES    new, used in one place: [ADMIN, QA_LEAD, TESTER, DEV]

Leaving DEV out of `EDITOR_ROLES` refuses it at all 158 sites that use it,
without touching one of them. Checked for role comparisons that bypass the
groups: three exist, all about keeping at least one ADMIN, none affected. One
list does need DEV adding — `ASSIGNABLE_PROJECT_ROLE_OPTIONS`, or it never
appears in the dropdown that assigns roles.

## The state, which must not be the test result

`testResult` answers "what happened when we ran it". This answers "where is
the repair". The project already learned what happens when those are
conflated — see the Test Case `status` / `testResult` thread.

  (null)           nobody is on it
  ASSIGNED         handed to a Dev
  IN_PROGRESS      the Dev is on it
  READY_TO_RETEST  the Dev says it is fixed

Cleared automatically when a tester records a new result. Retesting is the
end of the loop, so closing it should not be a second thing to remember.

## Writing back and the handoff history are one table

Both were asked for separately. They are the same record: an append-only
event, with an optional note on each.

  model WorkEvent
    testCaseId, actorId, toState, note?, occurredAt

`TestCase.workState` holds the current value, `WorkEvent` holds how it got
there — exactly the shape `TestRunCase.testResult` and `TestResultEvent`
already have, which this team has built once and Run History already proves.

The note is where a Dev writes "fixed in abc123", and where a tester writes
why they are handing it over.

## The page

One per project; not cross-project, by decision. Grouped by what has to
happen next, because the first question a Dev has is "what is waiting on me":

  To fix · In progress · Ready to retest

Each section paginates on its own, the way Problem Cases does — `page_<key>`
and `size_<key>`, five to a section, `Pagination` already takes `pageParam`
and `pageSizeParam` for this.

Each card shows what a Dev needs to not have to go and ask: what happened (the
tester's Actual Result), what should have happened, the steps, how many times
it has failed, the attachments, and who reported it. The only control is the
work state.

## Steps

DONE 1. Show a name instead of `assigneeId` on the Test Cases list and the Test
   Case detail page — both print a raw cuid today. Needed either way.
DONE 2. `DEV` role, `WORK_STATE_ROLES`, and DEV in the assignable options.
   Production schema change (adds an enum value; adds nothing to any row).
DONE 3. `TestCase.workState` + `WorkEvent`, and clearing on a new result.
   src/lib/work.ts, migration 20261021010000_work_state, tests/work.test.ts
   (11). Applied to the test and dev databases; production still to do.
DONE 4. Assign from the Test Run page: a column on the row, and a bulk action —
   "Select all" is already there, and without it assigning twenty cases is
   twenty clicks.
   An "Assigned to" column using InlineSelect, a bulk Assign in the selection
   panel, `assignCases`, and `updateAssignee` now delegating to `assignCase`
   so there is one way to write that column. `ASSIGNEE_ENABLED` is on.
   e2e/hand-off.spec.ts (2) and a seeded round + DEV account.
DONE 5. The My Work page.
   src/app/projects/[id]/my-work/page.tsx + `listMyWork`. Grouped by state,
   per-section pagination, a radio group and a note as the one control, and
   the hand-off history on each card.
DONE 6. `ProjectTabs` takes the role, and the four read-only pages a DEV may not
   open move from `ALL_MEMBER_ROLES` to `NON_DEV_ROLES`. A browser test each,
   proving the URL is refused and not merely missing from the menu.
DONE 7. `/projects/:id` sends a DEV to My Work.
DONE 8. `NotificationType` + `ASSIGNED`. Second production schema change.
   `notifyUser` beside `notifyProject`, because this one is addressed to a
   person rather than fanned out to a project.

## Left to do

Apply the three migrations to production (consent given), then commit.
`20261021000000_dev_role`, `20261021010000_work_state`,
`20261021020000_assigned_notification` — each adds an enum value, a nullable
column or a new table; none reads, rewrites or drops an existing row.

## What a DEV may open

Decided, with a table:

  sees        My Work · Dashboard · Modules · Notes · Files
  refused     Overview · Problem Cases · Test Runs · Import · Audit Trail

Hidden from the menu *and* refused by the server. Hiding alone is decoration
— the hole `/projects/new` once had, where the button was gone and the URL
still worked.

The actions are already safe. Every write goes through `EDITOR_ROLES`, which
DEV is not in, so all 158 of them refuse it without being touched. Import is
the example that was raised, and both its page and its two API routes already
use `EDITOR_ROLES` — a DEV typing that URL is already turned away today.

Reading is what changes, and it is four pages, not sixty-three:

  ALL_MEMBER_ROLES  [ADMIN, QA_LEAD, TESTER, VIEWER, DEV]  Dashboard, Modules
                                                           and below, Notes,
                                                           Files
  NON_DEV_ROLES     [ADMIN, QA_LEAD, TESTER, VIEWER]       Overview, Problem
                                                           Cases, Test Runs,
                                                           Audit Trail

Each of the four needs its own browser test proving the URL is refused, not
only absent from the menu. A hidden page nobody tried is a hidden page that
works.

## Run History stays visible to a DEV

A DEV may open Modules, and five levels below it the Test Case detail page
shows Run History — the rounds, reached by another road. Blocking the Test
Runs *page* does not block the test-run *data*, and that is deliberate rather
than overlooked: what is withheld is managing rounds, not the history of what
happened. My Work shows "failed 5x" on every card already, which is the same
fact by another name.

Written down because the alternative looks like the safer reading and is not:
hiding it would leave a Dev with "this is broken" and no idea how often or
since when, and would need a component change rather than a guard.

## Where a DEV lands

`/projects/:id` is where every link into a project points — the Projects
list, the picker in the header, the breadcrumb. A DEV may not open it, so
each of those would hand them a refusal.

That page checks the role and sends a DEV to `/projects/:id/my-work`. One
place, no link anywhere has to know about roles, and it is the same move the
site root just got when `/` learned to send people to `/projects`.

Login itself still lands on `/projects`: My Work belongs to a project, and
before one is chosen there is no "my work" to show. A DEV with exactly one
project will click through it every time — worth a look once this is in use,
not worth designing for now.

## Size

About the user-level audit log, which took one session. Not the "bigger than
everything so far" I first said — that estimate came from reading 158 call
sites and drawing the wrong conclusion from them, before noticing VIEWER
already solves the hard part.
