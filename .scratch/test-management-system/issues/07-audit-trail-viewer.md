# 07: Audit Trail Viewer

**What to build:** Any user can search and filter the history of changes already being recorded to `AuditLog` since ticket 02, scoped to Projects they're a member of. The Audit Trail is read-only for everyone, including Admin.

**Blocked by:** 02 (Project CRUD + Membership/RBAC Foundation) — functionally only needs the `AuditLog` table and its first writer to exist; more ticket types simply mean richer data to browse once 03–06 have landed.

**Status:** ready-for-agent

- [x] `GET /api/projects/:projectId/audit-log`: filter by user (`actorId`), action, entity type, and time range; paginated; scoped to Projects the caller is a member of (403 otherwise)
- [x] No `PATCH`/`DELETE` route is exposed for `AuditLog` under any role, including `ADMIN`
- [x] All `occurredAt` values stored and returned in UTC
- [x] Audit Trail UI: filterable/searchable table (date/time shown in one clearly-labeled time zone), showing actor, action, entity type/id, and old→new value diff
- [x] Tests: filter by each dimension independently and combined, cross-project isolation (can't see another project's log), no mutation route exists for the entity, timestamps round-trip as UTC

## Comments

Code review (Standards + Spec axes) found one real bug: both the API route and the page fed raw `datetime-local` input values (no timezone offset, e.g. `"2026-09-08T14:30"`) straight into `new Date()`, which parses a bare date-time string in the *server process's local timezone* per the ECMAScript spec — silently wrong given the page is labeled "All timestamps are shown in UTC". Fixed with `parseUtcDateTimeLocal()` in `src/lib/audit-log.ts`, which appends `Z` when no offset is present before parsing, used by both call sites. Also hardened `page`/`pageSize` against non-numeric input (`Number("abc")` → `NaN`) which would previously have reached Prisma un-sanitized. Added the missing test coverage the Spec review flagged: all four filters combined with a time range (both matching and non-matching), and a cross-project `actorId` filter attempt confirming it can't leak another project's entries. Standards review found only "defer" items (the filter-spread idiom and route/page parsing duplication are each too small/divergent to warrant abstraction yet). Re-verified: 49 tests passing, typecheck/lint/build all clean.
