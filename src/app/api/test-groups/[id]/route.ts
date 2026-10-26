import { NextResponse } from "next/server";
import { ChoiceError, WORKFLOW_STATUS_VALUES, readChoiceIfPresent } from "@/lib/enums";
import { withEntityCapability } from "@/lib/api-auth";
import {
  ConfirmRequiredError,
  ValidationError,
  deleteTestGroup,
  getTestGroupWithProjectId,
  updateTestGroup,
} from "@/lib/test-groups";

export const GET = withEntityCapability(
  "authoring.view",
  getTestGroupWithProjectId,
  async (_request, { entity }) => NextResponse.json(entity),
);

export const PATCH = withEntityCapability(
  "authoring.edit",
  getTestGroupWithProjectId,
  async (request, { entityId, userId }) => {
    const body = await request.json();

    try {
      const testGroup = await updateTestGroup(
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
      return NextResponse.json(testGroup);
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
  getTestGroupWithProjectId,
  async (request, { entityId, userId }) => {
    const body = await request.json().catch(() => ({}));

    try {
      const testGroup = await deleteTestGroup(entityId, userId, body.confirm === true);
      return NextResponse.json(testGroup);
    } catch (error) {
      if (error instanceof ConfirmRequiredError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }
  },
);
