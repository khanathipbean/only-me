# Status that rolls up from the children — Plan

Goal: setting a Test Case's status settles the Test Group, the Scenario and
the Requirement above it, instead of someone walking up four levels by hand.

Current vs desired (Diff):
- now: `Requirement`, `Scenario`, `TestGroup` and `TestCase` each carry a
  `WorkflowStatus` nobody keeps in step. A Requirement reads IN_PROGRESS long
  after every case under it was finished.
- want: a parent's status follows its live children, and stops being
  something anyone edits while it has any.

Not five levels, four: `Module` has no status at all. The chain is
Requirement → Scenario → Test Group → Test Case.

## The rule

Four values, not two: DRAFT, READY, IN_PROGRESS, COMPLETED.

> Every live child the same value → the parent takes it.
> Anything else → IN_PROGRESS.

Which gives "all COMPLETED → COMPLETED" and "all DRAFT → DRAFT", and reads as
one sentence rather than a table.

Known rough edge: children split between DRAFT and READY also come out
IN_PROGRESS, though nobody has started. Accepted — the alternative is a rule
with cases in it, and this one is explainable.

A parent with no live children is left alone. So is a `TestCase`, which has
no children; its `testResult` is a separate thing settled by Test Runs and
stays out of this.

## A parent's status is derived, so nobody edits it

While a row has live children its status is read-only, shown as a value
rather than offered as a field.

The alternative was an override flag, and it is worse in every direction. It
needs three new columns on the deployed database, a control to release the
override, and an answer to "who wins" that cannot be made obvious. And it
invites the failure it exists to prevent: a rollup that silently puts back
what somebody deliberately chose gets reported as a bug, correctly.

The case the override was for already has a better answer. Someone marks a
Requirement COMPLETED because its last Scenario is obsolete — archiving that
Scenario does it, because the rule counts only live children, and it leaves
the truth behind ("this is not in use") instead of a status that disagrees
with what is under it.

A row with **no** live children keeps an editable status: a Scenario just
created has nothing to derive from, and locking it would leave no way to say
anything about it at all. The field appears and disappears with the first
and last child.

No schema change. Nothing to run against the deployed database.

Out of scope / do NOT touch (Fence):
- `TestCase.testResult` and everything Test Runs do with it.
- `Project.status` and `TestRun.status`, which are different enums.
- Backfilling existing rows — see the last section.

Risks & unknowns:
- **Every path that changes the child set has to recompute**, and there are
  more than the obvious ones: create, update, duplicate, archive, restore,
  hard delete, **move — which touches the old parent as well as the new**,
  bulk archive, and the importer, which creates all four levels at once.
  Missing one leaves data quietly wrong, which is the failure mode the
  read-time alternative does not have.
- Archived children must not count, or a Test Group whose cases were all put
  away keeps their status for ever.
- Import creates thousands of rows in one transaction; recomputing per row
  would be thousands of extra queries. It recomputes once per affected
  parent at the end instead.

## Steps

1. `src/lib/status-rollup.ts` (new) — `rollUpFrom(tx, level, id)`: reads the
   live children's statuses, applies the rule, writes the parent unless it is
   overridden, then recurses upward. Pure of HTTP, takes a transaction so a
   caller's write and the rollup commit together.
   Verify: unit tests for each shape — all same, mixed, all COMPLETED, no
   children, archived children ignored.

2. Wire the write paths, level by level, each with a test that the parent
   moved: test-cases (create/update/duplicate/archive/bulkArchive/restore/
   delete/move), then test-groups, then scenarios, then requirements.

3. `src/lib/import/service.ts` — collect the parents touched, roll up once
   each after the rows are written.

4. The three edit forms — the Status field renders as a read-only value
   while the row has live children, and as a field when it has none.
   Verify: screenshot of both states.

5. `npx tsc --noEmit`, `npx eslint`, `npm test`.

## Existing rows

Left alone. The rule starts applying to anything edited from here, and a
backfill is a separate decision taken once the rule has been lived with —
running it on day one would overwrite every status anyone set by hand, on
production, before anyone has confirmed the rule is the one they wanted.
