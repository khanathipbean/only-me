# 06: Move / Re-parent Operations

**What to build:** A QA Lead can move a Scenario to a different Project, a Test Group to a different Scenario, or a Test Case to a different Test Group — each carrying every descendant with it in one transaction, with an impact warning shown before the move (and before Archive/Delete on any node with children).

**Blocked by:** 05 (Test Case CRUD)

**Status:** ready-for-agent

- [ ] `POST /api/scenarios/:id/move` `{ targetProjectId }`: re-points `Scenario.projectId`; all descendant `TestGroup`/`TestCase` rows keep their existing foreign keys (no copying, no re-creation) so they move implicitly; requires `ADMIN`/`QA_LEAD` on **both** source and target Project; writes `AuditLog` on the Scenario (and the move is visible in the target Project's Scenario list, not the source's, from that point on)
- [ ] `POST /api/test-groups/:id/move` `{ targetScenarioId }`: same pattern, one level down
- [ ] `POST /api/test-cases/:id/move` `{ targetTestGroupId }`: same pattern, one level down
- [ ] Each move endpoint returns the descendant counts being carried, for the UI to show an impact confirmation before calling it
- [ ] Archive/Delete endpoints from tickets 03–05 now return descendant counts too (small addition to each), so the UI can show the same impact warning there
- [ ] Move UI (on Scenario/Test Group/Test Case detail pages): "Move to..." action, target picker, impact confirmation showing descendant counts, then the move
- [ ] Impact confirmation added to existing Archive/Delete UI from tickets 03–05
- [ ] Tests: moving a Scenario carries its Test Groups and Test Cases (verify by re-querying the target Project's tree), moved item no longer appears under its old parent, cross-project move requires membership on both projects, impact counts returned match actual descendant counts
