-- Where a repair has got to, and how it got there.
--
-- `TestCase.workState` holds the current step of a hand-off; `WorkEvent`
-- records every move, including the one with a null `toState` that says a
-- tester retested the case and the loop closed. The same shape
-- `TestRunCase.testResult` and `TestResultEvent` already have.
--
-- Adds only: a new enum, a nullable column on `TestCase`, and a new table.
-- Nothing existing is read, rewritten or dropped, so every row keeps the
-- values it has and a case nobody has handed out reads NULL.

-- CreateEnum
CREATE TYPE "WorkState" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'READY_TO_RETEST');

-- AlterTable
ALTER TABLE "TestCase" ADD COLUMN     "workState" "WorkState";

-- CreateTable
CREATE TABLE "WorkEvent" (
    "id" TEXT NOT NULL,
    "testCaseId" TEXT NOT NULL,
    "actorId" TEXT,
    "toState" "WorkState",
    "assigneeId" TEXT,
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkEvent_testCaseId_occurredAt_idx" ON "WorkEvent"("testCaseId", "occurredAt");

-- CreateIndex
CREATE INDEX "WorkEvent_assigneeId_occurredAt_idx" ON "WorkEvent"("assigneeId", "occurredAt");

-- AddForeignKey
ALTER TABLE "WorkEvent" ADD CONSTRAINT "WorkEvent_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkEvent" ADD CONSTRAINT "WorkEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkEvent" ADD CONSTRAINT "WorkEvent_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

