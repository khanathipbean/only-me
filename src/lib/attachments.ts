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
    data: { testCaseId, storageKey, fileName: file.name, uploadedById },
  });
}

export async function listAttachmentsForTestCase(testCaseId: string) {
  return prisma.attachment.findMany({
    where: { testCaseId },
    orderBy: { uploadedAt: "desc" },
  });
}
