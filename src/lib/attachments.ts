import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { MAX_UPLOAD_BYTES, deleteFile, downloadFile, uploadFile } from "@/lib/storage";
import { assertRunOpenForCase } from "@/lib/test-runs";

const FOLDER = "attachments";

export class AttachmentValidationError extends Error {}

// The same two checks a project file gets. This path had neither, so a
// Test Case would take an empty file, or one of any size at all.
function validateFile(file: File) {
  if (file.size === 0) {
    throw new AttachmentValidationError("That file is empty");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new AttachmentValidationError(
      `File is larger than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB`,
    );
  }
}

// A bare UUID, the way project files are keyed. The uploader's filename used
// to be appended here, which is the one thing `saveProjectFile` is careful
// not to do: a name is not ours to build a path out of. It is kept in
// `fileName` below, which is display-only.
async function storeFile(file: File) {
  const storageKey = `${FOLDER}/${randomUUID()}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await uploadFile(storageKey, buffer, file.type || "application/octet-stream");
  return storageKey;
}

export async function saveAttachment(testCaseId: string, file: File, uploadedById: string) {
  validateFile(file);
  const storageKey = await storeFile(file);

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

/** A screenshot/log attached to one round's result — kept on the
 *  `TestRunCase`, not the `TestCase`, so a Test Case run across several
 *  rounds gets a separate attachment set per round rather than one shared
 *  bucket every round's evidence piles into. */
export async function saveRunCaseAttachment(runCaseId: string, file: File, uploadedById: string) {
  await assertRunOpenForCase(runCaseId);
  validateFile(file);
  const storageKey = await storeFile(file);

  return prisma.attachment.create({
    data: {
      runCaseId,
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

export async function listAttachmentsForRunCase(runCaseId: string) {
  return prisma.attachment.findMany({
    where: { runCaseId },
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
  if (!attachment || !attachment.testCase) {
    return null;
  }
  return { ...attachment, projectId: attachment.testCase.testGroup.scenario.projectId };
}

/** The run-case counterpart: `projectId` resolved through the Test Run
 *  rather than a Test Case's own hierarchy, since a round's attachment
 *  belongs to whichever project the round itself is filed under. */
export async function getRunCaseAttachmentWithProjectId(id: string) {
  const attachment = await prisma.attachment.findUnique({
    where: { id },
    include: { runCase: { include: { testRun: { select: { projectId: true } } } } },
  });
  if (!attachment || !attachment.runCase) {
    return null;
  }
  return { ...attachment, projectId: attachment.runCase.testRun.projectId };
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
  // Only a run-case attachment carries this restriction — a Test Case has no
  // "closed" state of its own for one of its own attachments to violate.
  if (attachment.runCaseId) {
    await assertRunOpenForCase(attachment.runCaseId);
  }
  await prisma.attachment.delete({ where: { id } });
  await deleteFile(attachment.storageKey);
}
