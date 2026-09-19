import { BellIcon, BoxIcon, CheckIcon, ClearIcon, FileIcon, UploadIcon, UserPlusIcon } from "@/components/icons";
import type { NotificationType } from "@/generated/prisma/client";

/**
 * Icon + tint per notification type — colour carries identity at a glance,
 * the same reasoning as `fileKindStyle`'s per-file-kind map. Kept in its own
 * plain module (no `"use client"`) so both `NotificationBell` (client) and
 * server-rendered lists like the Overview summary's activity feed can import
 * it without pulling a client component into server JSX.
 */
export const NOTIFICATION_TYPE_STYLE: Record<
  NotificationType,
  { Icon: typeof BellIcon; className: string }
> = {
  IMPORT_COMPLETED: { Icon: UploadIcon, className: "bg-green-500/10 text-green-600 dark:text-green-400" },
  TEST_RUN_CLOSED: { Icon: CheckIcon, className: "bg-brand/10 text-brand" },
  FILE_UPLOADED: { Icon: FileIcon, className: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  ENTITY_ARCHIVED: { Icon: BoxIcon, className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  TEST_CASE_FAILED: { Icon: ClearIcon, className: "bg-red-500/10 text-red-600 dark:text-red-400" },
  MEMBER_ADDED: { Icon: UserPlusIcon, className: "bg-teal-500/10 text-teal-600 dark:text-teal-400" },
};
