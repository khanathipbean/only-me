import { NextResponse } from "next/server";
import {
  ChoiceError,
  PRIORITY_VALUES,
  WORKFLOW_STATUS_VALUES,
  readChoice,
  readChoiceIfPresent,
  readFilterChoice,
} from "@/lib/enums";
import { withProjectRole } from "@/lib/api-auth";
import { ALL_MEMBER_ROLES, EDITOR_ROLES } from "@/lib/rbac";
import {
  ValidationError,
  createScenario,
  isScenarioSortField,
  listScenariosForProject,
} from "@/lib/scenarios";

export const GET = withProjectRole(ALL_MEMBER_ROLES, async (request, { projectId }) => {
  const { searchParams } = new URL(request.url);
  const sortBy = searchParams.get("sortBy");
  const sortOrder = searchParams.get("sortOrder");
  const scenarios = await listScenariosForProject(projectId, {
    search: searchParams.get("search") ?? undefined,
    status: readFilterChoice(searchParams.get("status"), WORKFLOW_STATUS_VALUES),
    priority: readFilterChoice(searchParams.get("priority"), PRIORITY_VALUES),
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
        requirementId: body.requirementId,
        name: body.name,
        description: body.description,
        preconditions: body.preconditions,
        testData: body.testData,
        steps: body.steps,
        expectedResult: body.expectedResult,
        priority: readChoice(body.priority, PRIORITY_VALUES, "Priority"),
        status: readChoiceIfPresent(body.status, WORKFLOW_STATUS_VALUES, "Status"),
        tags: body.tags,
        ownerId: body.ownerId,
      },
      userId,
    );
    return NextResponse.json(scenario, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError || error instanceof ChoiceError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
});
