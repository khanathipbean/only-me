import { NextResponse } from "next/server";
import { withEntityProjectRole } from "@/lib/api-auth";
import { EDITOR_ROLES } from "@/lib/rbac";
import { duplicateTestGroup, getTestGroupWithProjectId } from "@/lib/test-groups";

export const POST = withEntityProjectRole(
  EDITOR_ROLES,
  getTestGroupWithProjectId,
  async (_request, { entityId, userId }) => {
    const copy = await duplicateTestGroup(entityId, userId);
    return NextResponse.json(copy, { status: 201 });
  },
);
