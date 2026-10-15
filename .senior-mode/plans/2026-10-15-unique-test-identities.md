# Put uniqueEmail / uniqueCode to use — Plan

Goal: no test file hard-codes a globally unique identity any more.

Current vs desired (Diff):
- now: 206 distinct `@example.com` literals and ~60 project codes written by hand
  across 19 files, numbered from a counter nobody tracks. Two files share one
  database, so a collision is a failure in a test that is not wrong.
- want: every one of them comes from `uniqueEmail()` / `uniqueCode()` in
  `tests/support/fixtures.ts`, which are unique by construction.

## The fence — only two columns actually collide

`User.email` and `Project.code` are the only `@unique` columns the tests write.
Everything else that looks like an identifier is scoped to its parent and
cannot collide:

- requirement codes (`REQ-DSD-001`, `REQ-001`) — `code String?`, no unique
- module / scenario / test-case names — not unique
- role, status and result literals (`TESTER`, `FAILED`, …) — enum values

So: replace email and project-code literals. Touch nothing else.

Out of scope / do NOT touch (Fence):
- `e2e/` — its own database, its own seeded fixture with fixed credentials
- `tests/global-setup.ts`
- requirement codes inside import fixtures — they are the data under test
- `src/` — no production code changes at all

Risks & unknowns:
- Two literals are asserted on, not just passed through:
  `auth.test.ts:24` and `members.test.ts:63`. Both must bind the generated
  value to a const and assert against that const, or the assertion breaks.
- `import.test.ts` uses the project code as the join key between an import row
  and the project it targets. Same fix: one const, used in both places.
- `Project.code` has no length or format validation (`validateProjectInput`
  checks presence only), so a longer generated code is safe.

## Steps
1. modules.test.ts (5) — files: tests/modules.test.ts — verify: suite green; establishes the pattern
2. The pass-through files, smallest first — status-rollup, notifications,
   run-history, project-files, test-groups, requirements, audit-log, scenarios,
   projects, move, search, notes, test-cases, dashboard, test-runs
3. The two with assertions — auth.test.ts, members.test.ts — bind to a const
4. import.test.ts last — the code is a join key there, not decoration
5. Re-run the whole suite plus tsc and lint
