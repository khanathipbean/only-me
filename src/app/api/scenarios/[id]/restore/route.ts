import { NextResponse } from "next/server";
import { withEntityCapability } from "@/lib/api-auth";
import { getScenarioById, restoreScenario } from "@/lib/scenarios";

export const POST = withEntityCapability(
  "authoring.edit",
  getScenarioById,
  async (_request, { entityId, userId }) => {
    const scenario = await restoreScenario(entityId, userId);
    return NextResponse.json(scenario);
  },
);
