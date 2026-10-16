import { NextResponse } from "next/server";
import {
  ChoiceError,
  PRIORITY_VALUES,
  TEST_TYPE_VALUES,
  WORKFLOW_STATUS_VALUES,
  readChoice,
  readChoiceIfPresent,
} from "@/lib/enums";
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
          priority: readChoice(body.priority, PRIORITY_VALUES, "Priority"),
          testType: readChoiceIfPresent(body.testType, TEST_TYPE_VALUES, "Test Type"),
          status: readChoiceIfPresent(body.status, WORKFLOW_STATUS_VALUES, "Status"),
          steps: body.steps,
        },
        userId,
      );
      return NextResponse.json(testCase, { status: 201 });
    } catch (error) {
      if (error instanceof ValidationError || error instanceof ChoiceError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }
  },
);
