import { NextResponse } from "next/server";
import { withProjectRole } from "@/lib/api-auth";
import { ALL_MEMBER_ROLES } from "@/lib/rbac";
import {
  PRIORITY_VALUES,
  TEST_RESULT_VALUES,
  WORKFLOW_STATUS_VALUES,
  getProjectDashboard,
  parseUtcDateOnly,
} from "@/lib/dashboard";
import type { Priority, TestResult, WorkflowStatus } from "@/generated/prisma/client";

function asEnumOrUndefined<T extends string>(value: string | null, allowed: T[]): T | undefined {
  return value && (allowed as string[]).includes(value) ? (value as T) : undefined;
}

export const GET = withProjectRole(ALL_MEMBER_ROLES, async (request, { projectId }) => {
  const { searchParams } = new URL(request.url);
  const tags = searchParams.get("tags");

  const result = await getProjectDashboard(projectId, {
    scenarioId: searchParams.get("scenarioId") ?? undefined,
    testGroupId: searchParams.get("testGroupId") ?? undefined,
    testResult: asEnumOrUndefined<TestResult>(searchParams.get("testResult"), TEST_RESULT_VALUES),
    priority: asEnumOrUndefined<Priority>(searchParams.get("priority"), PRIORITY_VALUES),
    status: asEnumOrUndefined<WorkflowStatus>(searchParams.get("status"), WORKFLOW_STATUS_VALUES),
    assigneeId: searchParams.get("assigneeId") ?? undefined,
    tags: tags
      ? tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
      : undefined,
    createdFrom: parseUtcDateOnly(searchParams.get("createdFrom"), "start"),
    createdTo: parseUtcDateOnly(searchParams.get("createdTo"), "end"),
    updatedFrom: parseUtcDateOnly(searchParams.get("updatedFrom"), "start"),
    updatedTo: parseUtcDateOnly(searchParams.get("updatedTo"), "end"),
  });

  return NextResponse.json(result);
});
