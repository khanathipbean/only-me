import { NextResponse } from "next/server";
import {
  ChoiceError,
  PRIORITY_VALUES,
  TEST_TYPE_VALUES,
  WORKFLOW_STATUS_VALUES,
  readChoice,
  readChoiceIfPresent,
} from "@/lib/enums";
import { withEntityCapability } from "@/lib/api-auth";
import {
  ConfirmRequiredError,
  ValidationError,
  deleteTestCase,
  getTestCaseWithProjectId,
  updateTestCase,
} from "@/lib/test-cases";

export const GET = withEntityCapability(
  "authoring.view",
  getTestCaseWithProjectId,
  async (_request, { entity }) => NextResponse.json(entity),
);

export const PATCH = withEntityCapability(
  "authoring.edit",
  getTestCaseWithProjectId,
  async (request, { entityId, userId }) => {
    const body = await request.json();

    try {
      const testCase = await updateTestCase(
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
      return NextResponse.json(testCase);
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
  getTestCaseWithProjectId,
  async (request, { entityId, userId }) => {
    const body = await request.json().catch(() => ({}));

    try {
      const testCase = await deleteTestCase(entityId, userId, body.confirm === true);
      return NextResponse.json(testCase);
    } catch (error) {
      if (error instanceof ConfirmRequiredError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }
  },
);
