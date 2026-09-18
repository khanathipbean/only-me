import { NextResponse } from "next/server";
import { withProjectRole } from "@/lib/api-auth";
import { ALL_MEMBER_ROLES } from "@/lib/rbac";
import { getProjectDashboard } from "@/lib/dashboard";
import { PRIORITY_VALUES, TEST_RESULT_VALUES, WORKFLOW_STATUS_VALUES } from "@/lib/enums";
import type { Priority, TestResult, WorkflowStatus } from "@/generated/prisma/client";

function asEnumOrUndefined<T extends string>(value: string | null, allowed: T[]): T | undefined {
  return value && (allowed as string[]).includes(value) ? (value as T) : undefined;
}

export const GET = withProjectRole(ALL_MEMBER_ROLES, async (request, { projectId }) => {
  const { searchParams } = new URL(request.url);
  const tags = searchParams.get("tags");

  const result = await getProjectDashboard(projectId, {
    search: searchParams.get("search") ?? undefined,
    moduleId: searchParams.get("moduleId") ?? undefined,
    feature: searchParams.get("feature") ?? undefined,
    requirementId: searchParams.get("requirementId") ?? undefined,
    scenarioId: searchParams.get("scenarioId") ?? undefined,
    testGroupId: searchParams.get("testGroupId") ?? undefined,
    testRunId: searchParams.get("testRunId") ?? undefined,
    phase: searchParams.get("phase") ?? undefined,
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
  });

  return NextResponse.json(result);
});
