import { NextResponse } from "next/server";
import { withEntityCapability } from "@/lib/api-auth";
import { duplicateTestCase, getTestCaseWithProjectId } from "@/lib/test-cases";

export const POST = withEntityCapability(
  "authoring.edit",
  getTestCaseWithProjectId,
  async (_request, { entityId, userId }) => {
    const copy = await duplicateTestCase(entityId, userId);
    return NextResponse.json(copy, { status: 201 });
  },
);
