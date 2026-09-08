import { prisma } from "@/lib/prisma";

export async function writeAuditLog(entry: {
  entityType: string;
  entityId: string;
  action: string;
  actorId: string;
  projectId: string;
  oldValue?: unknown;
  newValue?: unknown;
}) {
  await prisma.auditLog.create({
    data: {
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      actorId: entry.actorId,
      projectId: entry.projectId,
      oldValue: entry.oldValue === undefined ? undefined : (entry.oldValue as object),
      newValue: entry.newValue === undefined ? undefined : (entry.newValue as object),
    },
  });
}
