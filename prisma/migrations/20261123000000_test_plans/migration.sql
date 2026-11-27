-- CreateEnum
CREATE TYPE "TestPlanStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD');

-- CreateTable
CREATE TABLE "TestPlan" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "description" TEXT,
    "environment" TEXT,
    "build" TEXT,
    "startsOn" TIMESTAMP(3),
    "endsOn" TIMESTAMP(3),
    "ownerId" TEXT NOT NULL,
    "status" "TestPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestPlanCase" (
    "id" TEXT NOT NULL,
    "testPlanId" TEXT NOT NULL,
    "testCaseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestPlanCase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TestPlan_projectId_status_idx" ON "TestPlan"("projectId", "status");

-- CreateIndex
CREATE INDEX "TestPlan_projectId_phase_idx" ON "TestPlan"("projectId", "phase");

-- CreateIndex
CREATE UNIQUE INDEX "TestPlan_projectId_name_key" ON "TestPlan"("projectId", "name");

-- CreateIndex
CREATE INDEX "TestPlanCase_testCaseId_idx" ON "TestPlanCase"("testCaseId");

-- CreateIndex
CREATE UNIQUE INDEX "TestPlanCase_testPlanId_testCaseId_key" ON "TestPlanCase"("testPlanId", "testCaseId");

-- AlterTable
-- Nullable, and no default: every round that exists today belongs to no plan,
-- and must go on belonging to none.
ALTER TABLE "TestRun" ADD COLUMN     "testPlanId" TEXT;

-- CreateIndex
CREATE INDEX "TestRun_testPlanId_idx" ON "TestRun"("testPlanId");

-- AddForeignKey
ALTER TABLE "TestPlan" ADD CONSTRAINT "TestPlan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestPlan" ADD CONSTRAINT "TestPlan_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestPlan" ADD CONSTRAINT "TestPlan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- Cascade from the plan only: deleting a plan takes its scope rows with it,
-- which hold nothing but the pairing. The Test Case side restricts, because a
-- case named by a plan is a case somebody still means to test.
ALTER TABLE "TestPlanCase" ADD CONSTRAINT "TestPlanCase_testPlanId_fkey" FOREIGN KEY ("testPlanId") REFERENCES "TestPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestPlanCase" ADD CONSTRAINT "TestPlanCase_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestRun" ADD CONSTRAINT "TestRun_testPlanId_fkey" FOREIGN KEY ("testPlanId") REFERENCES "TestPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
