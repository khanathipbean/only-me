import { NextResponse } from "next/server";
import { withEntityCapability } from "@/lib/api-auth";
import { ValidationError, archiveScenario, getScenarioById } from "@/lib/scenarios";

export const POST = withEntityCapability(
  "authoring.edit",
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
