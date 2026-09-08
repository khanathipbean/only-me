import { NextResponse } from "next/server";
import { withEntityProjectRole } from "@/lib/api-auth";
import { EDITOR_ROLES } from "@/lib/rbac";
import { archiveTestCase, getTestCaseWithProjectId } from "@/lib/test-cases";

export const POST = withEntityProjectRole(
  EDITOR_ROLES,
  getTestCaseWithProjectId,
  async (_request, { entityId, userId }) => {
    const testCase = await archiveTestCase(entityId, userId);
    return NextResponse.json(testCase);
  },
);
