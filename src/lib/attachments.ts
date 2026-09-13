import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

export async function saveAttachment(testCaseId: string, file: File, uploadedById: string) {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  const storageKey = `${randomUUID()}-${file.name}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(UPLOAD_DIR, storageKey), buffer);

  return prisma.attachment.create({
    data: {
      testCaseId,
      storageKey,
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      size: file.size,
      uploadedById,
    },
  });
}

export async function listAttachmentsForTestCase(testCaseId: string) {
  return prisma.attachment.findMany({
    where: { testCaseId },
    orderBy: { uploadedAt: "desc" },
  });
}

/** Plus a synthesized `projectId`, the same way `getTestCaseWithProjectId`
 * does — this is the entity the download/delete route checks role against. */
export async function getAttachmentWithProjectId(id: string) {
  const attachment = await prisma.attachment.findUnique({
    where: { id },
    include: {
      testCase: { include: { testGroup: { include: { scenario: { select: { projectId: true } } } } } },
    },
  });
  if (!attachment) {
    return null;
  }
  return { ...attachment, projectId: attachment.testCase.testGroup.scenario.projectId };
}

/** Reads the bytes back. Resolves through the stored key only. */
export async function readAttachmentBytes(storageKey: string) {
  return fs.readFile(path.join(UPLOAD_DIR, storageKey));
}

/**
 * Hard delete: unlike Project Files, an Attachment has no `deletedAt` column
 * and no restore UI, so there's nothing a soft delete would buy here — it's a
 * single file against one Test Case, cheaply re-uploaded if removed by
 * mistake.
 */
export async function deleteAttachment(id: string) {
  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment) {
    return;
  }
  await prisma.attachment.delete({ where: { id } });
  await fs.rm(path.join(UPLOAD_DIR, attachment.storageKey), { force: true });
}
