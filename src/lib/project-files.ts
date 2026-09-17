import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { MAX_UPLOAD_BYTES, downloadFile, uploadFile } from "@/lib/storage";

const FOLDER = "project-files";

export const MAX_FILE_BYTES = MAX_UPLOAD_BYTES;

/**
 * Types the browser can display without being able to run anything.
 *
 * Anything outside this list is served as a download. SVG is deliberately
 * absent: it is an XML document that can carry script, so rendering one
 * inline would run that script on this app's own origin, with access to the
 * session cookie.
 */
const INLINE_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

export function canPreview(contentType: string) {
  return INLINE_TYPES.has(contentType);
}

export type FileKind = "pdf" | "word" | "excel" | "csv" | "image" | "generic";

const WORD_TYPES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const EXCEL_TYPES = new Set([
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

/**
 * Which icon a file's card should show. Content type comes first, but
 * browsers are inconsistent about what they report for office documents
 * (`application/octet-stream` is common), so the file name's extension is
 * the fallback rather than a second source of truth.
 */
export function getFileKind(contentType: string, fileName: string): FileKind {
  if (contentType.startsWith("image/")) return "image";
  if (contentType === "application/pdf") return "pdf";
  if (contentType === "text/csv") return "csv";
  if (EXCEL_TYPES.has(contentType)) return "excel";
  if (WORD_TYPES.has(contentType)) return "word";

  const ext = fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase();
  switch (ext) {
    case "pdf":
      return "pdf";
    case "csv":
      return "csv";
    case "xls":
    case "xlsx":
      return "excel";
    case "doc":
    case "docx":
      return "word";
    default:
      return "generic";
  }
}

export class FileValidationError extends Error {}

export async function saveProjectFile(
  projectId: string,
  moduleId: string,
  file: File,
  uploadedById: string,
) {
  // Not named `module`: that identifier is reserved in a CommonJS scope and
  // the Next lint rule rejects assigning to it.
  const target = moduleId
    ? await prisma.module.findFirst({ where: { id: moduleId, projectId, deletedAt: null } })
    : null;
  if (!target) {
    throw new FileValidationError("Choose a module");
  }
  if (file.size === 0) {
    throw new FileValidationError("That file is empty");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new FileValidationError(
      `File is larger than ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB`,
    );
  }

  // The key is a bare UUID — the uploader's filename never reaches storage,
  // so a name like "../../etc/passwd" can't steer where the bytes land.
  const storageKey = `${FOLDER}/${randomUUID()}`;
  await uploadFile(
    storageKey,
    Buffer.from(await file.arrayBuffer()),
    file.type || "application/octet-stream",
  );

  return prisma.projectFile.create({
    data: {
      projectId,
      moduleId: target.id,
      // The text column stays written until phase 2 drops it, so a rollback
      // doesn't leave files with no heading at all.
      module: target.name,
      fileName: file.name,
      storageKey,
      contentType: file.type || "application/octet-stream",
      size: file.size,
      uploadedById,
    },
  });
}

/** Every live file in the project, grouped under its module heading. */
export async function listProjectFilesByModule(projectId: string) {
  const files = await prisma.projectFile.findMany({
    where: { projectId, deletedAt: null },
    orderBy: [{ module: "asc" }, { uploadedAt: "desc" }],
  });

  const groups = new Map<string, typeof files>();
  for (const file of files) {
    const group = groups.get(file.module);
    if (group) {
      group.push(file);
    } else {
      groups.set(file.module, [file]);
    }
  }
  return [...groups.entries()].map(([module, items]) => ({ module, files: items }));
}

export async function getProjectFile(id: string) {
  return prisma.projectFile.findFirst({ where: { id, deletedAt: null } });
}

/** Reads the bytes back. Resolves through the stored key only. */
export async function readProjectFileBytes(storageKey: string) {
  return downloadFile(storageKey);
}

/** Soft delete, matching every other level of the app — the bytes stay in
 * storage so an accidental removal is recoverable. */
export async function deleteProjectFile(id: string) {
  return prisma.projectFile.update({ where: { id }, data: { deletedAt: new Date() } });
}
