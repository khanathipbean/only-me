import { NextResponse } from "next/server";
import { withProjectRole } from "@/lib/api-auth";
import { ALL_MEMBER_ROLES, EDITOR_ROLES } from "@/lib/rbac";
import {
  ValidationError,
  createScenario,
  isScenarioSortField,
  listScenariosForProject,
} from "@/lib/scenarios";
import type { ScenarioPriority, WorkflowStatus } from "@/generated/prisma/client";

export const GET = withProjectRole(ALL_MEMBER_ROLES, async (request, { projectId }) => {
  const { searchParams } = new URL(request.url);
  const sortBy = searchParams.get("sortBy");
  const sortOrder = searchParams.get("sortOrder");
  const scenarios = await listScenariosForProject(projectId, {
    search: searchParams.get("search") ?? undefined,
    status: (searchParams.get("status") as WorkflowStatus | null) ?? undefined,
    priority: (searchParams.get("priority") as ScenarioPriority | null) ?? undefined,
    sortBy: isScenarioSortField(sortBy) ? sortBy : undefined,
    sortOrder: sortOrder === "asc" ? "asc" : undefined,
  });
  return NextResponse.json(scenarios);
});

export const POST = withProjectRole(EDITOR_ROLES, async (request, { projectId, userId }) => {
  const body = await request.json();

  try {
    const scenario = await createScenario(
      projectId,
      {
        name: body.name,
        description: body.description,
        preconditions: body.preconditions,
        testData: body.testData,
        steps: body.steps,
        expectedResult: body.expectedResult,
        priority: body.priority,
        status: body.status,
        tags: body.tags,
        ownerId: body.ownerId,
      },
      userId,
    );
    return NextResponse.json(scenario, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
});
