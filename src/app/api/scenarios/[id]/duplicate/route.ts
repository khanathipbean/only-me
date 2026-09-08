import { NextResponse } from "next/server";
import { withEntityProjectRole } from "@/lib/api-auth";
import { EDITOR_ROLES } from "@/lib/rbac";
import { duplicateScenario, getScenarioById } from "@/lib/scenarios";

export const POST = withEntityProjectRole(
  EDITOR_ROLES,
  getScenarioById,
  async (_request, { entityId, userId }) => {
    const copy = await duplicateScenario(entityId, userId);
    return NextResponse.json(copy, { status: 201 });
  },
);
