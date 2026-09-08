import { NextResponse } from "next/server";
import { checkProjectRole, withEntityProjectRole } from "@/lib/api-auth";
import { EDITOR_ROLES } from "@/lib/rbac";
import { getScenarioById } from "@/lib/scenarios";
import { getTestGroupWithProjectId, moveTestGroup } from "@/lib/test-groups";

export const POST = withEntityProjectRole(
  EDITOR_ROLES,
  getTestGroupWithProjectId,
  async (request, { entityId, userId }) => {
    const body = await request.json();
    const targetScenarioId = body.targetScenarioId as string;

    const targetScenario = await getScenarioById(targetScenarioId);
    if (!targetScenario || targetScenario.deletedAt) {
      return NextResponse.json(
        { error: "Target Scenario not found or archived" },
        { status: 404 },
      );
    }

    const { forbidden } = await checkProjectRole(userId, targetScenario.projectId, EDITOR_ROLES);
    if (forbidden) {
      return forbidden;
    }

    const testGroup = await moveTestGroup(entityId, targetScenarioId, userId);
    return NextResponse.json(testGroup);
  },
);
