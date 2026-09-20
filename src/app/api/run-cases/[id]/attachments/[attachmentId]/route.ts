import { NextResponse } from "next/server";
import { checkProjectRole, requireApiSession } from "@/lib/api-auth";
import { ALL_MEMBER_ROLES, EDITOR_ROLES } from "@/lib/rbac";
import { TestRunValidationError } from "@/lib/test-runs";
import { canPreview } from "@/lib/project-files";
import {
  deleteAttachment,
  getRunCaseAttachmentWithProjectId,
  readAttachmentBytes,
} from "@/lib/attachments";

/**
 * Serves one Test Run Case attachment to a member of that round's project.
 *
 * Mirrors `/api/test-cases/[id]/attachments/[attachmentId]`: only types that
 * can't execute are sent inline, `nosniff` stops the browser second-guessing
 * the type, and the CSP neuters anything that slips through anyway.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const { userId, unauthorized } = await requireApiSession();
  if (unauthorized) {
    return unauthorized;
  }

  const { id: runCaseId, attachmentId } = await context.params;
  const attachment = await getRunCaseAttachmentWithProjectId(attachmentId);
  // Checked against the URL's run case too: a valid id from another round
  // must not be readable just because the caller belongs to this project.
  if (!attachment || attachment.runCaseId !== runCaseId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { forbidden } = await checkProjectRole(userId!, attachment.projectId, ALL_MEMBER_ROLES);
  if (forbidden) {
    return forbidden;
  }

  let bytes: Buffer;
  try {
    bytes = await readAttachmentBytes(attachment.storageKey);
  } catch {
    return NextResponse.json({ error: "File is missing from storage" }, { status: 410 });
  }

  const disposition = canPreview(attachment.contentType) ? "inline" : "attachment";
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": attachment.contentType,
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
      "Content-Length": String(bytes.byteLength),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, no-store",
    },
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const { userId, unauthorized } = await requireApiSession();
  if (unauthorized) {
    return unauthorized;
  }

  const { id: runCaseId, attachmentId } = await context.params;
  const attachment = await getRunCaseAttachmentWithProjectId(attachmentId);
  if (!attachment || attachment.runCaseId !== runCaseId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { forbidden } = await checkProjectRole(userId!, attachment.projectId, EDITOR_ROLES);
  if (forbidden) {
    return forbidden;
  }

  try {
    await deleteAttachment(attachmentId);
  } catch (error) {
    if (error instanceof TestRunValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
  return NextResponse.json({ ok: true });
}
