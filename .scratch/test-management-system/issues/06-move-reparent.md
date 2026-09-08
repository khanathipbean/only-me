# 06: Move / Re-parent Operations

**What to build:** A QA Lead can move a Scenario to a different Project, a Test Group to a different Scenario, or a Test Case to a different Test Group — each carrying every descendant with it in one transaction, with an impact warning shown before the move (and before Archive/Delete on any node with children).

**Blocked by:** 05 (Test Case CRUD)

**Status:** ready-for-agent

- [x] `POST /api/scenarios/:id/move` `{ targetProjectId }`: re-points `Scenario.projectId`; all descendant `TestGroup`/`TestCase` rows keep their existing foreign keys (no copying, no re-creation) so they move implicitly; requires `ADMIN`/`QA_LEAD` on **both** source and target Project; writes `AuditLog` on the Scenario (and the move is visible in the target Project's Scenario list, not the source's, from that point on)
- [x] `POST /api/test-groups/:id/move` `{ targetScenarioId }`: same pattern, one level down
- [x] `POST /api/test-cases/:id/move` `{ targetTestGroupId }`: same pattern, one level down (a Test Case is a leaf, so unlike the two moves above it carries no descendants and returns none)
- [x] Each move endpoint returns the descendant counts being carried, for the UI to show an impact confirmation before calling it
- [x] Archive/Delete endpoints from tickets 03–05 now return descendant counts too (small addition to each), so the UI can show the same impact warning there
- [x] Move UI (on Scenario/Test Group/Test Case detail pages): "Move to..." action, target picker, impact confirmation showing descendant counts, then the move
- [x] Impact confirmation added to existing Archive/Delete UI from tickets 03–05
- [x] Tests: moving a Scenario carries its Test Groups and Test Cases (verify by re-querying the target Project's tree), moved item no longer appears under its old parent, cross-project move requires membership on both projects, impact counts returned match actual descendant counts

## Comments

Note on the Test Case move bullet: added a clarification that a Test Case is a leaf and carries/returns no descendant counts, unlike the Scenario and Test Group moves — the ticket's "same pattern, one level down" phrasing didn't account for that.

Code review (Standards + Spec axes) found no security holes in the core dual-project role check (verified all three move routes require EDITOR on both source and target), but did find two real correctness gaps: (1) none of the three move routes verified the target Project/Scenario/Test Group actually still exists and isn't archived — a bogus target id or an archived one would either 500 or silently succeed depending on the path; fixed by checking existence + `deletedAt` before the role check (and matching the same check in the three page-level move server actions) — moving into an archived parent is now a 404; (2) `moveTestCase` didn't have a target-existence check at all before this pass touched all three uniformly. Also fixed a mislabeled test (`"...and updates counts on archive"` never actually called archive) and added the missing cross-project 403 tests for Test Group and Test Case moves (only Scenario move had one). Deferred per Standards review: a shared "check target project" helper across the three routes (only 2 of 3 share an identical shape; forcing it now risks Speculative Generality) and the `moveTestGroup` sequence-reassignment race under concurrent writes (pre-existing pattern from `createTestGroup`, not introduced by this ticket, no unique constraint backing it yet). Re-verified: 42 tests passing, typecheck/lint/build all clean.
