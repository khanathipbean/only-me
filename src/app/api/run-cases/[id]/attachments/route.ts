import { NextResponse } from "next/server";
import { withEntityCapability } from "@/lib/api-auth";
import { TestRunValidationError, getRunCaseWithProjectId } from "@/lib/test-runs";
import {
  AttachmentValidationError,
  listAttachmentsForRunCase,
  saveRunCaseAttachment,
} from "@/lib/attachments";

export const GET = withEntityCapability(
  "runs.evidence",
  getRunCaseWithProjectId,
  async (_request, { entityId }) => {
    const attachments = await listAttachmentsForRunCase(entityId);
    return NextResponse.json(attachments);
  },
);

export const POST = withEntityCapability(
  "runs.manage",
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
