import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { deleteFile, downloadFile, uploadFile } from "@/lib/storage";

const FOLDER = "attachments";

export async function saveAttachment(testCaseId: string, file: File, uploadedById: string) {
  const storageKey = `${FOLDER}/${randomUUID()}-${file.name}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await uploadFile(storageKey, buffer, file.type || "application/octet-stream");

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
  return downloadFile(storageKey);
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
  await deleteFile(attachment.storageKey);
}
