import { NextResponse } from "next/server";
import { checkProjectRole, withEntityProjectRole } from "@/lib/api-auth";
import { EDITOR_ROLES } from "@/lib/rbac";
import { getProjectById } from "@/lib/projects";
import { getScenarioById, moveScenario } from "@/lib/scenarios";

export const POST = withEntityProjectRole(
  EDITOR_ROLES,
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

    const { forbidden } = await checkProjectRole(userId, targetProjectId, EDITOR_ROLES);
    if (forbidden) {
      return forbidden;
    }

    const scenario = await moveScenario(entityId, targetProjectId, userId);
    return NextResponse.json(scenario);
  },
);
