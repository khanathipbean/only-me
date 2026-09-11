import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "project-files");

export const MAX_FILE_BYTES = 20 * 1024 * 1024;

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

export class FileValidationError extends Error {}

export async function saveProjectFile(
  projectId: string,
  module: string,
  file: File,
  uploadedById: string,
) {
  const moduleName = module.trim();
  if (!moduleName) {
    throw new FileValidationError("Module is required");
  }
  if (file.size === 0) {
    throw new FileValidationError("That file is empty");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new FileValidationError(
      `File is larger than ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB`,
    );
  }

  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  // The key is a bare UUID — the uploader's filename never reaches the
  // filesystem, so a name like "../../etc/passwd" can't steer the write.
  const storageKey = randomUUID();
  await fs.writeFile(path.join(UPLOAD_DIR, storageKey), Buffer.from(await file.arrayBuffer()));

  return prisma.projectFile.create({
    data: {
      projectId,
      module: moduleName,
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
  return fs.readFile(path.join(UPLOAD_DIR, storageKey));
}

/** Soft delete, matching every other level of the app — the bytes stay on
 * disk so an accidental removal is recoverable. */
export async function deleteProjectFile(id: string) {
  return prisma.projectFile.update({ where: { id }, data: { deletedAt: new Date() } });
}
