import { prisma } from "@/lib/prisma";
import { paginate } from "@/lib/pagination";

/**
 * Parses a `datetime-local`-style string (e.g. "2026-09-08T14:30", no
 * timezone offset) as UTC — `new Date()` would otherwise parse it in the
 * server process's local timezone, silently misinterpreting a value the UI
 * labels "All timestamps are shown in UTC".
 */
export function parseUtcDateTimeLocal(value: string | null | undefined) {
  if (!value) {
    return undefined;
  }
  const withZone = /[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`;
  const date = new Date(withZone);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Every `action` the app writes to the audit log — the filter's dropdown
 * options. Kept here next to the query so a newly logged action can't be
 * added without the filter that has to find it being right beside it. */
export const AUDIT_ACTIONS = [
  "create",
  "update",
  "delete",
  "archive",
  "restore",
  "duplicate",
  "move",
  "update-assignee",
  "update-result",
  "reorder-test-groups",
  "import-create",
  "import-update",
  "import-skip",
] as const;

export type AuditLogFilters = {
  /** Exact match, for callers that already hold a user id (the API route). */
  actorId?: string;
  /** Case-insensitive partial match on the actor's name, for the UI's search box. */
  actorName?: string;
  action?: string;
  entityType?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
};

export async function listAuditLogForProject(projectId: string, filters: AuditLogFilters = {}) {

  const where = {
    projectId,
    ...(filters.actorId ? { actorId: filters.actorId } : {}),
    ...(filters.actorName
      ? { actor: { name: { contains: filters.actorName, mode: "insensitive" as const } } }
      : {}),
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
    ...(filters.from || filters.to
      ? {
          occurredAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
  };

  const { items, ...rest } = await paginate(
    filters,
    () => prisma.auditLog.count({ where }),
    ({ skip, take }) =>
      prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, name: true, email: true } } },
        orderBy: { occurredAt: "desc" },
        skip,
        take,
      }),
  );
  return { entries: items, ...rest };
}

/** Which account an entry is about, dug out of wherever it was written.
 *
 * A `User` entry names it outright. A membership entry names a row in a
 * join table, and the account is in the values beside it — under three
 * different keys, because the three were written at different times for
 * different reasons:
 *
 * - granting access puts it in `entityId` as `userId:projectId`, since the
 *   membership row has no id until after it exists;
 * - removing access and changing a role put it in `oldValue.userId`.
 *
 * Role changes written before any of this say only which role it was, so
 * their account is looked up from the membership row — which is still there,
 * a role change being the one of the three that does not remove it.
 */
function subjectOf(entry: {
  entityType: string;
  entityId: string;
  oldValue: unknown;
  newValue: unknown;
}): string | null {
  if (entry.entityType === "User") {
    return entry.entityId;
  }
  for (const value of [entry.newValue, entry.oldValue]) {
    if (value && typeof value === "object" && "userId" in value) {
      const userId = (value as { userId: unknown }).userId;
      if (typeof userId === "string") {
        return userId;
      }
    }
  }
  return entry.entityId.includes(":") ? entry.entityId.split(":")[0] : null;
}

/**
 * Everything that has happened to an account: made, given access, given a
 * different role, had access taken away, had a password set, been unlocked,
 * been deleted.
 *
 * Membership entries carry a Project and so appear on that Project's own
 * Audit Trail too, and that is not duplication to be tidied away. The two
 * lists answer different questions — "what has been done in PROM" and "what
 * has been done to this person" — and a role change is honestly both. It was
 * only on the first of them, which is why the Users page showed nothing for
 * an account somebody had just created and given access to.
 *
 * Filtered on `entityType`, not on a null `projectId`. An optional relation
 * means Prisma emits `ON DELETE SET NULL` on the project foreign key, so a
 * Project that could be hard-deleted would turn its entries into
 * null-project ones. Nothing can hard-delete a Project here — only archive
 * it — and filtering on what the entry is about rather than on what it lacks
 * means that fact is not load bearing.
 */
export async function listUserAuditLog(filters: AuditLogFilters = {}) {
  const where = {
    entityType: { in: ["User", "ProjectMember"] },
    ...(filters.actorId ? { actorId: filters.actorId } : {}),
    ...(filters.actorName
      ? { actor: { name: { contains: filters.actorName, mode: "insensitive" as const } } }
      : {}),
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.from || filters.to
      ? {
          occurredAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
  };

  const { items, ...rest } = await paginate(
    filters,
    () => prisma.auditLog.count({ where }),
    ({ skip, take }) =>
      prisma.auditLog.findMany({
        where,
        include: {
          actor: { select: { id: true, name: true, email: true } },
        },
        orderBy: { occurredAt: "desc" },
        skip,
        take,
      }),
  );

  /* The account an entry happened to may have been deleted — which is one of
   * the things recorded here. So the name is looked up separately and
   * allowed to be missing, rather than joined and relied upon. */
  const resolved = items.map((entry) => ({ entry, subjectId: subjectOf(entry) }));

  /* The role changes that predate `oldValue.userId` have nothing to go on but
   * the membership row they name, so those are asked for by id. One query for
   * the page, and only when there is something in it to ask about. */
  const unknownMembershipIds = resolved
    .filter((row) => row.subjectId === null)
    .map((row) => row.entry.entityId);
  const recovered = unknownMembershipIds.length
    ? await prisma.projectMember.findMany({
        where: { id: { in: unknownMembershipIds } },
        select: { id: true, userId: true },
      })
    : [];
  const userIdByMembership = new Map(recovered.map((m) => [m.id, m.userId]));

  const subjectIds = [
    ...new Set(
      resolved
        .map((row) => row.subjectId ?? userIdByMembership.get(row.entry.entityId) ?? null)
        .filter((id): id is string => id !== null),
    ),
  ];
  const [subjects, projects] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: subjectIds } },
      select: { id: true, name: true, email: true },
    }),
    /* And which Project a membership entry was about, so the line can say
     * "added to PROM" rather than "added". */
    prisma.project.findMany({
      where: {
        id: {
          in: [
            ...new Set(
              items
                .map((entry) => entry.projectId)
                .filter((id): id is string => id !== null),
            ),
          ],
        },
      },
      select: { id: true, name: true },
    }),
  ]);
  const subjectById = new Map(subjects.map((user) => [user.id, user]));
  const projectById = new Map(projects.map((project) => [project.id, project]));

  return {
    entries: resolved.map(({ entry, subjectId }) => {
      const id = subjectId ?? userIdByMembership.get(entry.entityId) ?? null;
      return {
        ...entry,
        subject: id ? (subjectById.get(id) ?? null) : null,
        project: entry.projectId ? (projectById.get(entry.projectId) ?? null) : null,
      };
    }),
    ...rest,
  };
}
