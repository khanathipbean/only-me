import { NextResponse } from "next/server";
import { withEntityProjectRole } from "@/lib/api-auth";
import { ALL_MEMBER_ROLES, EDITOR_ROLES } from "@/lib/rbac";
import {
  ConfirmRequiredError,
  ValidationError,
  deleteTestGroup,
  getTestGroupWithProjectId,
  updateTestGroup,
} from "@/lib/test-groups";

export const GET = withEntityProjectRole(
  ALL_MEMBER_ROLES,
  getTestGroupWithProjectId,
  async (_request, { entity }) => NextResponse.json(entity),
);

export const PATCH = withEntityProjectRole(
  EDITOR_ROLES,
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
          status: body.status,
          ownerId: body.ownerId,
        },
        userId,
      );
      return NextResponse.json(testGroup);
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
