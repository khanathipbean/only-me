import { NextResponse } from "next/server";
import { withEntityProjectRole } from "@/lib/api-auth";
import { EDITOR_ROLES } from "@/lib/rbac";
import {
  ValidationError,
  archiveTestGroup,
  getTestGroupWithProjectId,
} from "@/lib/test-groups";

export const POST = withEntityProjectRole(
  EDITOR_ROLES,
  getTestGroupWithProjectId,
  async (_request, { entityId, userId }) => {
    try {
      const testGroup = await archiveTestGroup(entityId, userId);
      return NextResponse.json(testGroup);
    } catch (error) {
      // Refused for still carrying live Test Cases.
      if (error instanceof ValidationError) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      throw error;
    }
  },
);
