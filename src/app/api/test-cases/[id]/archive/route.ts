import { NextResponse } from "next/server";
import { withEntityCapability } from "@/lib/api-auth";
import { archiveTestCase, getTestCaseWithProjectId } from "@/lib/test-cases";

export const POST = withEntityCapability(
  "authoring.edit",
  getTestCaseWithProjectId,
  async (_request, { entityId, userId }) => {
    const testCase = await archiveTestCase(entityId, userId);
    return NextResponse.json(testCase);
  },
);
