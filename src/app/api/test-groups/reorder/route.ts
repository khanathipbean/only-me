import { NextRequest, NextResponse } from "next/server";
import { checkProjectRole, requireApiSession } from "@/lib/api-auth";
import { EDITOR_ROLES } from "@/lib/rbac";
import { getScenarioById } from "@/lib/scenarios";
import { InvalidReorderError, reorderTestGroups } from "@/lib/test-groups";

export async function POST(request: NextRequest) {
  const { userId, unauthorized } = await requireApiSession();
  if (unauthorized) {
    return unauthorized;
  }

  const body = await request.json();
  const scenario = await getScenarioById(body.scenarioId);
  if (!scenario) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { forbidden } = await checkProjectRole(userId!, scenario.projectId, EDITOR_ROLES);
  if (forbidden) {
    return forbidden;
  }

  try {
    const testGroups = await reorderTestGroups(body.scenarioId, body.orderedIds, userId!);
    return NextResponse.json(testGroups);
  } catch (error) {
    if (error instanceof InvalidReorderError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
