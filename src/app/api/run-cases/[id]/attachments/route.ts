import { NextResponse } from "next/server";
import { withEntityProjectRole } from "@/lib/api-auth";
import { ALL_MEMBER_ROLES, EDITOR_ROLES } from "@/lib/rbac";
import { TestRunValidationError, getRunCaseWithProjectId } from "@/lib/test-runs";
import {
  AttachmentValidationError,
  listAttachmentsForRunCase,
  saveRunCaseAttachment,
} from "@/lib/attachments";

export const GET = withEntityProjectRole(
  ALL_MEMBER_ROLES,
  getRunCaseWithProjectId,
  async (_request, { entityId }) => {
    const attachments = await listAttachmentsForRunCase(entityId);
    return NextResponse.json(attachments);
  },
);

export const POST = withEntityProjectRole(
  EDITOR_ROLES,
  getRunCaseWithProjectId,
  async (request, { entityId, userId }) => {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    try {
      const attachment = await saveRunCaseAttachment(entityId, file, userId);
      return NextResponse.json(attachment, { status: 201 });
    } catch (error) {
      if (error instanceof AttachmentValidationError || error instanceof TestRunValidationError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }
  },
);
