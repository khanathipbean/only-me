import { writeAuditLog } from "@/lib/audit";

export type SoftDeleteAction = "archive" | "restore" | "delete";

/**
 * Shared archive/restore/delete write path: performs the update, then writes
 * one AuditLog row. `projectId` must already be resolved by the caller (each
 * entity resolves it differently depending on how deep it sits in the
 * Project > Scenario > Test Group > Test Case hierarchy).
 */
export async function setDeletedAt<T extends { id: string }>(params: {
  entityType: string;
  actorId: string;
  action: SoftDeleteAction;
  projectId: string;
  deletedAt: Date | null;
  update: (deletedAt: Date | null) => Promise<T>;
}): Promise<T> {
  const entity = await params.update(params.deletedAt);

  await writeAuditLog({
    entityType: params.entityType,
    entityId: entity.id,
    action: params.action,
    actorId: params.actorId,
    projectId: params.projectId,
  });

  return entity;
}
