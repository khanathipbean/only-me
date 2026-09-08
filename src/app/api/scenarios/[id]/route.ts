import { NextResponse } from "next/server";
import { withEntityProjectRole } from "@/lib/api-auth";
import { ALL_MEMBER_ROLES, EDITOR_ROLES } from "@/lib/rbac";
import {
  ConfirmRequiredError,
  ValidationError,
  deleteScenario,
  getScenarioById,
  updateScenario,
} from "@/lib/scenarios";

export const GET = withEntityProjectRole(
  ALL_MEMBER_ROLES,
  getScenarioById,
  async (_request, { entity }) => NextResponse.json(entity),
);

export const PATCH = withEntityProjectRole(
  EDITOR_ROLES,
  getScenarioById,
  async (request, { entityId, userId }) => {
    const body = await request.json();

    try {
      const scenario = await updateScenario(
        entityId,
        {
          name: body.name,
          description: body.description,
          preconditions: body.preconditions,
          testData: body.testData,
          steps: body.steps,
          expectedResult: body.expectedResult,
          priority: body.priority,
          status: body.status,
          tags: body.tags,
          ownerId: body.ownerId,
        },
        userId,
      );
      return NextResponse.json(scenario);
    } catch (error) {
      if (error instanceof ValidationError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }
  },
);

export const DELETE = withEntityProjectRole(
  EDITOR_ROLES,
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
