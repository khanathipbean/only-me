-- When a repair was promised.
--
-- Set from the case's priority at the moment it changed hands, and stored
-- rather than worked out on the fly: a deadline is a promise made on a day,
-- so changing the table of windows later must not move one somebody has
-- already been given.
--
-- Adds a nullable column and an index. Nothing existing is read, rewritten or
-- dropped — every case already handed out reads NULL and is never counted
-- late, because no date was ever promised for it.
-- AlterTable
ALTER TABLE "TestCase" ADD COLUMN     "dueAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "TestCase_assigneeId_dueAt_idx" ON "TestCase"("assigneeId", "dueAt");
