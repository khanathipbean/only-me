import { prisma } from "@/lib/prisma";

export async function writeAuditLog(entry: {
  entityType: string;
  entityId: string;
  action: string;
  actorId: string;
  /** Left out for something that happened to an account rather than inside a
   *  project — see the note on `AuditLog.projectId`. */
  projectId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
}) {
  await prisma.auditLog.create({
    data: {
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      actorId: entry.actorId,
      projectId: entry.projectId ?? null,
      oldValue: entry.oldValue === undefined ? undefined : (entry.oldValue as object),
      newValue: entry.newValue === undefined ? undefined : (entry.newValue as object),
    },
  });
}
