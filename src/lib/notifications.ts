import { prisma } from "@/lib/prisma";
import { listAllMembers } from "@/lib/members";
import { paginate, type PageFilters } from "@/lib/pagination";
import type { NotificationType } from "@/generated/prisma/client";

/**
 * Writes one row per project member (fan-out on write), not a single event
 * row plus a read-receipts table — simpler to query "my unread count" from,
 * and this app's scale doesn't need the storage savings the alternative buys.
 */
export async function notifyProject(params: {
  projectId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  actorId?: string;
  /** Usually the actor: nobody needs telling about their own action. */
  excludeUserId?: string;
}) {
  const members = await listAllMembers({ projectId: params.projectId });
  const recipientIds = members
    .map((member) => member.userId)
    .filter((userId) => userId !== params.excludeUserId);

  if (recipientIds.length === 0) {
    return;
  }

  await prisma.notification.createMany({
    data: recipientIds.map((recipientId) => ({
      recipientId,
      projectId: params.projectId,
      type: params.type,
      title: params.title,
      body: params.body,
      link: params.link,
      actorId: params.actorId,
    })),
  });
}

export type NotificationFilters = { unreadOnly?: boolean } & PageFilters;

export async function listNotificationsForUser(userId: string, filters: NotificationFilters) {
  const where = {
    recipientId: userId,
    ...(filters.unreadOnly ? { readAt: null } : {}),
  };

  return paginate(
    filters,
    () => prisma.notification.count({ where }),
    ({ skip, take }) =>
      prisma.notification.findMany({
        where,
        orderBy: { occurredAt: "desc" },
        skip,
        take,
      }),
  );
}

export function countUnreadNotifications(userId: string) {
  return prisma.notification.count({ where: { recipientId: userId, readAt: null } });
}

/** Scoped by `recipientId` in the `where`, not just the id, so one user can
 * never mark another's notification read. */
export async function markNotificationRead(id: string, userId: string) {
  await prisma.notification.updateMany({
    where: { id, recipientId: userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllNotificationsRead(userId: string) {
  await prisma.notification.updateMany({
    where: { recipientId: userId, readAt: null },
    data: { readAt: new Date() },
  });
}
