import type { Priority, TestResult, WorkflowStatus } from "@/generated/prisma/client";

/**
 * Pure enum-value lists, deliberately kept in a module with no server-only
 * imports (no `@/lib/prisma`) so client components can safely import from
 * here without pulling the `pg` driver into the browser bundle.
 */
export const TEST_RESULT_VALUES: TestResult[] = [
  "NOT_RUN",
  "PASSED",
  "FAILED",
  "BLOCKED",
  "SKIPPED",
];

export const PRIORITY_VALUES: Priority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

export const WORKFLOW_STATUS_VALUES: WorkflowStatus[] = [
  "DRAFT",
  "READY",
  "IN_PROGRESS",
  "COMPLETED",
];
