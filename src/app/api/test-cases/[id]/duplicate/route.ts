import { NextResponse } from "next/server";
import { withEntityProjectRole } from "@/lib/api-auth";
import { EDITOR_ROLES } from "@/lib/rbac";
import { duplicateTestCase, getTestCaseWithProjectId } from "@/lib/test-cases";

export const POST = withEntityProjectRole(
  EDITOR_ROLES,
  getTestCaseWithProjectId,
  async (_request, { entityId, userId }) => {
    const copy = await duplicateTestCase(entityId, userId);
    return NextResponse.json(copy, { status: 201 });
  },
);
