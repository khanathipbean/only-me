import { NextResponse } from "next/server";
import { withEntityProjectRole } from "@/lib/api-auth";
import { EDITOR_ROLES } from "@/lib/rbac";
import { getTestCaseWithProjectId, updateAssignee } from "@/lib/test-cases";

export const PATCH = withEntityProjectRole(
  EDITOR_ROLES,
  getTestCaseWithProjectId,
  async (request, { entityId, userId }) => {
    const body = await request.json();
    const testCase = await updateAssignee(entityId, body.assigneeId ?? null, userId);
    return NextResponse.json(testCase);
  },
);
