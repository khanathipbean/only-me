import { NextResponse } from "next/server";
import { withEntityProjectRole } from "@/lib/api-auth";
import { EDITOR_ROLES } from "@/lib/rbac";
import { archiveTestGroup, getTestGroupWithProjectId } from "@/lib/test-groups";

export const POST = withEntityProjectRole(
  EDITOR_ROLES,
  getTestGroupWithProjectId,
  async (_request, { entityId, userId }) => {
    const testGroup = await archiveTestGroup(entityId, userId);
    return NextResponse.json(testGroup);
  },
);
