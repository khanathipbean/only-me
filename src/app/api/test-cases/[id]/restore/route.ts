import { NextResponse } from "next/server";
import { withEntityCapability } from "@/lib/api-auth";
import { getTestCaseWithProjectId, restoreTestCase } from "@/lib/test-cases";

export const POST = withEntityCapability(
  "authoring.edit",
  getTestCaseWithProjectId,
  async (_request, { entityId, userId }) => {
    const testCase = await restoreTestCase(entityId, userId);
    return NextResponse.json(testCase);
  },
);
