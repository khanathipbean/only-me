import { NextResponse } from "next/server";
import { withEntityProjectRole } from "@/lib/api-auth";
import { ALL_MEMBER_ROLES, EDITOR_ROLES } from "@/lib/rbac";
import { getTestCaseWithProjectId } from "@/lib/test-cases";
import { listAttachmentsForTestCase, saveAttachment } from "@/lib/attachments";

export const GET = withEntityProjectRole(
  ALL_MEMBER_ROLES,
  getTestCaseWithProjectId,
  async (_request, { entityId }) => {
    const attachments = await listAttachmentsForTestCase(entityId);
    return NextResponse.json(attachments);
  },
);

export const POST = withEntityProjectRole(
  [...EDITOR_ROLES, "TESTER"],
  getTestCaseWithProjectId,
  async (request, { entityId, userId }) => {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const attachment = await saveAttachment(entityId, file, userId);
    return NextResponse.json(attachment, { status: 201 });
  },
);
