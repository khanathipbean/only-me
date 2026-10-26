import { NextResponse } from "next/server";
import { withEntityCapability } from "@/lib/api-auth";
import { duplicateScenario, getScenarioById } from "@/lib/scenarios";

export const POST = withEntityCapability(
  "authoring.edit",
  getScenarioById,
  async (_request, { entityId, userId }) => {
    const copy = await duplicateScenario(entityId, userId);
    return NextResponse.json(copy, { status: 201 });
  },
);
