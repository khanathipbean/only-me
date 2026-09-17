import { NextResponse } from "next/server";
import { withEntityProjectRole } from "@/lib/api-auth";
import { EDITOR_ROLES } from "@/lib/rbac";
import { ValidationError, archiveScenario, getScenarioById } from "@/lib/scenarios";

export const POST = withEntityProjectRole(
  EDITOR_ROLES,
  getScenarioById,
  async (_request, { entityId, userId }) => {
    try {
      const scenario = await archiveScenario(entityId, userId);
      return NextResponse.json(scenario);
    } catch (error) {
      // Refused for still carrying live Test Groups: the caller's situation,
      // not a fault.
      if (error instanceof ValidationError) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      throw error;
    }
  },
);
