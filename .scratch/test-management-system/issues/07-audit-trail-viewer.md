# 07: Audit Trail Viewer

**What to build:** Any user can search and filter the history of changes already being recorded to `AuditLog` since ticket 02, scoped to Projects they're a member of. The Audit Trail is read-only for everyone, including Admin.

**Blocked by:** 02 (Project CRUD + Membership/RBAC Foundation) — functionally only needs the `AuditLog` table and its first writer to exist; more ticket types simply mean richer data to browse once 03–06 have landed.

**Status:** ready-for-agent

- [ ] `GET /api/projects/:projectId/audit-log`: filter by user (`actorId`), action, entity type, and time range; paginated; scoped to Projects the caller is a member of (403 otherwise)
- [ ] No `PATCH`/`DELETE` route is exposed for `AuditLog` under any role, including `ADMIN`
- [ ] All `occurredAt` values stored and returned in UTC
- [ ] Audit Trail UI: filterable/searchable table (date/time shown in one clearly-labeled time zone), showing actor, action, entity type/id, and old→new value diff
- [ ] Tests: filter by each dimension independently and combined, cross-project isolation (can't see another project's log), no mutation route exists for the entity, timestamps round-trip as UTC
