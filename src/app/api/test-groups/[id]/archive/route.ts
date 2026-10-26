import { NextResponse } from "next/server";
import { withEntityCapability } from "@/lib/api-auth";
import {
  ValidationError,
  archiveTestGroup,
  getTestGroupWithProjectId,
} from "@/lib/test-groups";

export const POST = withEntityCapability(
  "authoring.edit",
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
