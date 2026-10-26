import { NextResponse } from "next/server";
import { withEntityCapability } from "@/lib/api-auth";
import { getTestCaseWithProjectId } from "@/lib/test-cases";
import {
  AttachmentValidationError,
  listAttachmentsForTestCase,
  saveAttachment,
} from "@/lib/attachments";

export const GET = withEntityCapability(
  "authoring.view",
  getTestCaseWithProjectId,
  async (_request, { entityId }) => {
    const attachments = await listAttachmentsForTestCase(entityId);
    return NextResponse.json(attachments);
  },
);

export const POST = withEntityCapability(
  "authoring.edit",
  getTestCaseWithProjectId,
  async (request, { entityId, userId }) => {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    try {
      const attachment = await saveAttachment(entityId, file, userId);
      return NextResponse.json(attachment, { status: 201 });
    } catch (error) {
      // A file the service refuses is the caller's mistake, not a fault.
      if (error instanceof AttachmentValidationError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }
  },
);
