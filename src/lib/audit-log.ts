import { prisma } from "@/lib/prisma";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

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

export type AuditLogFilters = {
  actorId?: string;
  action?: string;
  entityType?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
};

function sanitizePositiveInt(value: number | undefined, fallback: number, max: number) {
  if (value === undefined || Number.isNaN(value) || value < 1) {
    return fallback;
  }
  return Math.min(value, max);
}

export async function listAuditLogForProject(projectId: string, filters: AuditLogFilters = {}) {
  const pageSize = sanitizePositiveInt(filters.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const page = sanitizePositiveInt(filters.page, 1, Number.MAX_SAFE_INTEGER);

  const where = {
    projectId,
    ...(filters.actorId ? { actorId: filters.actorId } : {}),
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

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { actor: { select: { id: true, name: true, email: true } } },
      orderBy: { occurredAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    entries,
    total,
    page,
    pageSize,
    totalPages: Math.max(Math.ceil(total / pageSize), 1),
  };
}
