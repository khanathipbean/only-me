import { NextResponse } from "next/server";
import { withEntityCapability } from "@/lib/api-auth";
import { getTestGroupWithProjectId, restoreTestGroup } from "@/lib/test-groups";

export const POST = withEntityCapability(
  "authoring.edit",
  getTestGroupWithProjectId,
  async (_request, { entityId, userId }) => {
    const testGroup = await restoreTestGroup(entityId, userId);
    return NextResponse.json(testGroup);
  },
);
