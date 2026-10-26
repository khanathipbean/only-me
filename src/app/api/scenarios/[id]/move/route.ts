import { NextResponse } from "next/server";
import { checkCapability, withEntityCapability } from "@/lib/api-auth";
import { getProjectById } from "@/lib/projects";
import { getScenarioById, moveScenario } from "@/lib/scenarios";

export const POST = withEntityCapability(
  "authoring.edit",
  getScenarioById,
  async (request, { entityId, userId }) => {
    const body = await request.json();
    const targetProjectId = body.targetProjectId as string;

    const targetProject = await getProjectById(targetProjectId);
    if (!targetProject || targetProject.deletedAt) {
      return NextResponse.json(
        { error: "Target Project not found or archived" },
        { status: 404 },
      );
    }

    const { forbidden } = await checkCapability(userId, targetProjectId, "authoring.edit");
    if (forbidden) {
      return forbidden;
    }

    const scenario = await moveScenario(entityId, targetProjectId, userId);
    return NextResponse.json(scenario);
  },
);
