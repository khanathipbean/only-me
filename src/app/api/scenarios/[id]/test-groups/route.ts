import { NextResponse } from "next/server";
import { withEntityProjectRole } from "@/lib/api-auth";
import { ALL_MEMBER_ROLES, EDITOR_ROLES } from "@/lib/rbac";
import { getScenarioById } from "@/lib/scenarios";
import {
  ValidationError,
  createTestGroup,
  listTestGroupsForScenario,
} from "@/lib/test-groups";

export const GET = withEntityProjectRole(
  ALL_MEMBER_ROLES,
  getScenarioById,
  async (_request, { entityId }) => {
    const testGroups = await listTestGroupsForScenario(entityId);
    return NextResponse.json(testGroups);
  },
);

export const POST = withEntityProjectRole(
  EDITOR_ROLES,
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
          status: body.status,
          ownerId: body.ownerId,
        },
        userId,
      );
      return NextResponse.json(testGroup, { status: 201 });
    } catch (error) {
      if (error instanceof ValidationError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }
  },
);
