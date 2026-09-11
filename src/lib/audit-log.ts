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
