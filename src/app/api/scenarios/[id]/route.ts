import { NextResponse } from "next/server";
import {
  ChoiceError,
  PRIORITY_VALUES,
  WORKFLOW_STATUS_VALUES,
  readChoice,
  readChoiceIfPresent,
} from "@/lib/enums";
import { withEntityCapability } from "@/lib/api-auth";
import {
  ConfirmRequiredError,
  ValidationError,
  deleteScenario,
  getScenarioById,
  updateScenario,
} from "@/lib/scenarios";

export const GET = withEntityCapability(
  "authoring.view",
  getScenarioById,
  async (_request, { entity }) => NextResponse.json(entity),
);

export const PATCH = withEntityCapability(
  "authoring.edit",
  getScenarioById,
  async (request, { entityId, userId }) => {
    const body = await request.json();

    try {
      const scenario = await updateScenario(
        entityId,
        {
          requirementId: body.requirementId,
          name: body.name,
          description: body.description,
          preconditions: body.preconditions,
          testData: body.testData,
          steps: body.steps,
          expectedResult: body.expectedResult,
          priority: readChoice(body.priority, PRIORITY_VALUES, "Priority"),
          status: readChoiceIfPresent(body.status, WORKFLOW_STATUS_VALUES, "Status"),
          tags: body.tags,
          ownerId: body.ownerId,
        },
        userId,
      );
      return NextResponse.json(scenario);
    } catch (error) {
      if (error instanceof ValidationError || error instanceof ChoiceError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }
  },
);

export const DELETE = withEntityCapability(
  "authoring.edit",
  getScenarioById,
  async (request, { entityId, userId }) => {
    const body = await request.json().catch(() => ({}));

    try {
      const scenario = await deleteScenario(entityId, userId, body.confirm === true);
      return NextResponse.json(scenario);
    } catch (error) {
      if (error instanceof ConfirmRequiredError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }
  },
);
