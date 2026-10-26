import { NextResponse } from "next/server";
import { withEntityCapability } from "@/lib/api-auth";
import { duplicateTestGroup, getTestGroupWithProjectId } from "@/lib/test-groups";

export const POST = withEntityCapability(
  "authoring.edit",
  getTestGroupWithProjectId,
  async (_request, { entityId, userId }) => {
    const copy = await duplicateTestGroup(entityId, userId);
    return NextResponse.json(copy, { status: 201 });
  },
);
