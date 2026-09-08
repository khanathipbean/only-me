import { NextResponse } from "next/server";
import { withEntityProjectRole } from "@/lib/api-auth";
import { ALL_MEMBER_ROLES, EDITOR_ROLES } from "@/lib/rbac";
import {
  ConfirmRequiredError,
  RestrictedFieldError,
  TESTER_EDITABLE_FIELDS,
  ValidationError,
  deleteTestCase,
  getTestCaseWithProjectId,
  updateTestCase,
  updateTestResultAndNotes,
} from "@/lib/test-cases";

export const GET = withEntityProjectRole(
  ALL_MEMBER_ROLES,
  getTestCaseWithProjectId,
  async (_request, { entity }) => NextResponse.json(entity),
);

export const PATCH = withEntityProjectRole(
  [...EDITOR_ROLES, "TESTER"],
  getTestCaseWithProjectId,
  async (request, { entityId, userId, membership }) => {
    const body = await request.json();

    try {
      if (membership?.role === "TESTER") {
        const disallowed = Object.keys(body).filter(
          (key) => !(TESTER_EDITABLE_FIELDS as readonly string[]).includes(key),
        );
        if (disallowed.length > 0) {
          throw new RestrictedFieldError(disallowed);
        }
        const testCase = await updateTestResultAndNotes(
          entityId,
          { testResult: body.testResult, notes: body.notes },
          userId,
        );
        return NextResponse.json(testCase);
      }

      const testCase = await updateTestCase(
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
      return NextResponse.json(testCase);
    } catch (error) {
      if (error instanceof ValidationError || error instanceof RestrictedFieldError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }
  },
);

export const DELETE = withEntityProjectRole(
  EDITOR_ROLES,
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
