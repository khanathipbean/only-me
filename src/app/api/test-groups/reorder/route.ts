import { NextRequest, NextResponse } from "next/server";
import { checkCapability, requireApiSession } from "@/lib/api-auth";
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

  const { forbidden } = await checkCapability(userId!, scenario.projectId, "authoring.edit");
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
