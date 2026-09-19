import {
  FileCsvIcon,
  FileExcelIcon,
  FileIcon,
  FileImageIcon,
  FilePdfIcon,
  FileWordIcon,
} from "@/components/icons";
import type { FileKind } from "@/lib/project-files";

/**
 * Icon + tint per file kind — colour carries the type at a glance, the way
 * Drive/Office icons do. Kept in its own plain module (no `"use client"`) so
 * both `FilePreview` (client) and server-rendered lists like the Overview
 * summary can import it without pulling a client component into server JSX.
 */
export const FILE_KIND_STYLE: Record<FileKind, { Icon: typeof FileIcon; className: string }> = {
  pdf: { Icon: FilePdfIcon, className: "text-red-600 dark:text-red-400" },
  word: { Icon: FileWordIcon, className: "text-blue-600 dark:text-blue-400" },
  excel: { Icon: FileExcelIcon, className: "text-green-600 dark:text-green-400" },
  csv: { Icon: FileCsvIcon, className: "text-green-600 dark:text-green-400" },
  image: { Icon: FileImageIcon, className: "text-purple-600 dark:text-purple-400" },
  generic: { Icon: FileIcon, className: "text-muted" },
};
