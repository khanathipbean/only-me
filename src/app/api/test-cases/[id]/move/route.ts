import { NextResponse } from "next/server";
import { checkCapability, withEntityCapability } from "@/lib/api-auth";
import { getTestGroupWithProjectId } from "@/lib/test-groups";
import { getTestCaseWithProjectId, moveTestCase } from "@/lib/test-cases";

export const POST = withEntityCapability(
  "authoring.edit",
  getTestCaseWithProjectId,
  async (request, { entityId, userId }) => {
    const body = await request.json();
    const targetTestGroupId = body.targetTestGroupId as string;

    const targetTestGroup = await getTestGroupWithProjectId(targetTestGroupId);
    if (!targetTestGroup || targetTestGroup.deletedAt) {
      return NextResponse.json(
        { error: "Target Test Group not found or archived" },
        { status: 404 },
      );
    }

    const { forbidden } = await checkCapability(userId, targetTestGroup.projectId, "authoring.edit");
    if (forbidden) {
      return forbidden;
    }

    const testCase = await moveTestCase(entityId, targetTestGroupId, userId);
    return NextResponse.json(testCase);
  },
);
