import { NextResponse } from "next/server";
import { withEntityCapability } from "@/lib/api-auth";
import { getTestCaseWithProjectId, updateAssignee } from "@/lib/test-cases";

export const PATCH = withEntityCapability(
  "handoff.assign",
  getTestCaseWithProjectId,
  async (request, { entityId, userId }) => {
    const body = await request.json();
    const testCase = await updateAssignee(entityId, body.assigneeId ?? null, userId);
    return NextResponse.json(testCase);
  },
);
