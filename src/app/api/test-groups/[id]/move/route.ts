import { NextResponse } from "next/server";
import { checkCapability, withEntityCapability } from "@/lib/api-auth";
import { getScenarioById } from "@/lib/scenarios";
import { getTestGroupWithProjectId, moveTestGroup } from "@/lib/test-groups";

export const POST = withEntityCapability(
  "authoring.edit",
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

    const { forbidden } = await checkCapability(userId, targetScenario.projectId, "authoring.edit");
    if (forbidden) {
      return forbidden;
    }

    const testGroup = await moveTestGroup(entityId, targetScenarioId, userId);
    return NextResponse.json(testGroup);
  },
);
