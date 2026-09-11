import { NextResponse } from "next/server";
import { checkProjectRole, requireApiSession } from "@/lib/api-auth";
import { ALL_MEMBER_ROLES } from "@/lib/rbac";
import { canPreview, getProjectFile, readProjectFileBytes } from "@/lib/project-files";

/**
 * Serves one project file to a member of that project.
 *
 * Only types that can't execute are sent inline; everything else is forced to
 * download, because an uploaded `.html` or `.svg` rendered here would run on
 * this app's origin and could read the session cookie. `nosniff` stops the
 * browser second-guessing the type, and the CSP neuters anything that does
 * slip through by refusing it every resource and dropping it into a sandbox.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; fileId: string }> },
) {
  const { userId, unauthorized } = await requireApiSession();
  if (unauthorized) {
    return unauthorized;
  }

  const { id: projectId, fileId } = await context.params;
  const { forbidden } = await checkProjectRole(userId!, projectId, ALL_MEMBER_ROLES);
  if (forbidden) {
    return forbidden;
  }

  const file = await getProjectFile(fileId);
  // Checked against the URL's project too: a valid id from another project
  // must not be readable just because the caller belongs to this one.
  if (!file || file.projectId !== projectId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let bytes: Buffer;
  try {
    bytes = await readProjectFileBytes(file.storageKey);
  } catch {
    return NextResponse.json({ error: "File is missing from storage" }, { status: 410 });
  }

  const disposition = canPreview(file.contentType) ? "inline" : "attachment";
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": file.contentType,
      // RFC 5987 form as well, so non-ASCII names survive.
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      "Content-Length": String(bytes.byteLength),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, no-store",
    },
  });
}
