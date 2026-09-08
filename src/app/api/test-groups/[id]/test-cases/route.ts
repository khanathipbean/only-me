import { NextResponse } from "next/server";
import { withEntityProjectRole } from "@/lib/api-auth";
import { ALL_MEMBER_ROLES, EDITOR_ROLES } from "@/lib/rbac";
import { getTestGroupWithProjectId } from "@/lib/test-groups";
import {
  ValidationError,
  createTestCase,
  listTestCasesForTestGroup,
} from "@/lib/test-cases";

export const GET = withEntityProjectRole(
  ALL_MEMBER_ROLES,
  getTestGroupWithProjectId,
  async (_request, { entityId }) => {
    const testCases = await listTestCasesForTestGroup(entityId);
    return NextResponse.json(testCases);
  },
);

export const POST = withEntityProjectRole(
  EDITOR_ROLES,
  getTestGroupWithProjectId,
  async (request, { entityId, userId }) => {
    const body = await request.json();

    try {
      const testCase = await createTestCase(
        entityId,
        {
          name: body.name,
          condition: body.condition,
          preconditions: body.preconditions,
          testData: body.testData,
          expectedResult: body.expectedResult,
          priority: body.priority,
          testType: body.testType,
          status: body.status,
          steps: body.steps,
        },
        userId,
      );
      return NextResponse.json(testCase, { status: 201 });
    } catch (error) {
      if (error instanceof ValidationError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }
  },
);
