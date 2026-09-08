import { NextResponse } from "next/server";
import { withEntityProjectRole } from "@/lib/api-auth";
import { EDITOR_ROLES } from "@/lib/rbac";
import { archiveScenario, getScenarioById } from "@/lib/scenarios";

export const POST = withEntityProjectRole(
  EDITOR_ROLES,
  getScenarioById,
  async (_request, { entityId, userId }) => {
    const scenario = await archiveScenario(entityId, userId);
    return NextResponse.json(scenario);
  },
);
