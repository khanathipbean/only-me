-- Lets an audit entry belong to an account rather than to a project.
--
-- Setting a password for somebody, unlocking their account and deleting it
-- were recorded nowhere, because every entry needed a project and none of
-- those happen inside one. The log answered every question except the one
-- about itself: who changed my password.
--
-- Nothing here touches a row. The 1,666 entries that exist keep their
-- projectId; the column simply stops insisting on one.

-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_projectId_fkey";

-- AlterTable
ALTER TABLE "AuditLog" ALTER COLUMN "projectId" DROP NOT NULL;

-- CreateIndex
-- Account-level entries are read by entityType with no project to narrow by,
-- and this table only grows.
CREATE INDEX "AuditLog_entityType_occurredAt_idx" ON "AuditLog"("entityType", "occurredAt");

-- AddForeignKey
-- SET NULL rather than the old RESTRICT, which is what Prisma emits for an
-- optional relation. Inert here: a Project is only ever archived, never
-- deleted, so nothing can reach it. The reader filters on entityType rather
-- than on a null projectId so it would not matter even if something could.
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
