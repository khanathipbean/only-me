import { NextResponse } from "next/server";
import { ChoiceError, WORKFLOW_STATUS_VALUES, readChoiceIfPresent } from "@/lib/enums";
import { withEntityCapability } from "@/lib/api-auth";
import { getScenarioById } from "@/lib/scenarios";
import {
  ValidationError,
  createTestGroup,
  listTestGroupsForScenario,
} from "@/lib/test-groups";

export const GET = withEntityCapability(
  "authoring.view",
  getScenarioById,
  async (_request, { entityId }) => {
    const testGroups = await listTestGroupsForScenario(entityId);
    return NextResponse.json(testGroups);
  },
);

export const POST = withEntityCapability(
  "authoring.edit",
  getScenarioById,
  async (request, { entityId, userId }) => {
    const body = await request.json();

    try {
      const testGroup = await createTestGroup(
        entityId,
        {
          name: body.name,
          description: body.description,
          testObjective: body.testObjective,
          status: readChoiceIfPresent(body.status, WORKFLOW_STATUS_VALUES, "Status"),
          ownerId: body.ownerId,
        },
        userId,
      );
      return NextResponse.json(testGroup, { status: 201 });
    } catch (error) {
      if (error instanceof ValidationError || error instanceof ChoiceError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }
  },
);
