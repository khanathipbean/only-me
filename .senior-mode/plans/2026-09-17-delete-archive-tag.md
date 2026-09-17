# Delete, Archive and the Feature tag — Plan

Three decisions taken by the user, all "option ก":

- **#4** Delete must really delete, cascading to descendants.
- **#7** The Feature tag must read as a label, not a state.
- **#8** Scenario and Test Group must refuse to archive while live children hang
  off them, the way Module and Requirement already do.

Out of scope / do NOT touch (Fence):
- The soft-delete `deletedAt` column and the Archived views — archive keeps
  working exactly as it does now.
- AuditLog rows for deleted entities: `entityId` is a plain string with no
  foreign key, so the trail survives the row and should.
- ProjectFile: a file filed under a Module is not a descendant of it. Module
  delete keeps refusing while files still point at it.

Risks:
- No `onDelete` is declared anywhere in the schema, so Prisma defaults required
  relations to Restrict: a raw delete of a parent fails on the foreign key.
  Descendants get deleted explicitly, in order, inside one transaction — no
  migration, and what is destroyed stays visible in the code.
- A cascade must reach archived descendants too, not only live ones.
- Attachments own bytes in storage. Those are deleted after the transaction
  commits, best-effort: the row is gone either way, and a failure there must
  not fail the delete.
- Deleting a Test Case destroys its result in every past Test Run.

## Steps
1. `#7` — a variant on Badge, applied to the two Feature tags. Verify: the
   Requirement row no longer shows two cyan pills meaning different things.
2. `#8` — `assertScenarioNotInUse` / `assertTestGroupNotInUse`, mirroring the
   two that exist. Verify: tests, and the message names what is in the way.
3. `#4` — one `deleteDescendants` helper per level, called by the five delete
   functions. Verify: tests prove rows are really gone and that archive still
   only sets `deletedAt`.
4. tsc + eslint + vitest + playwright.
