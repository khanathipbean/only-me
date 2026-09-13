import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { downloadFile } from "@/lib/storage";

/**
 * Serves a user's profile picture to any signed-in member of the app.
 *
 * No project-role check: an avatar isn't project-scoped, and it's shown
 * anywhere a person's name appears (their own account menu today, other
 * members' names elsewhere later) rather than behind one project's data.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { unauthorized } = await requireApiSession();
  if (unauthorized) {
    return unauthorized;
  }

  const { id } = await context.params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { avatarKey: true, avatarContentType: true },
  });
  if (!user?.avatarKey) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let bytes: Buffer;
  try {
    bytes = await downloadFile(user.avatarKey);
  } catch {
    return NextResponse.json({ error: "Picture is missing from storage" }, { status: 410 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": user.avatarContentType ?? "application/octet-stream",
      "Content-Length": String(bytes.byteLength),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, max-age=300",
    },
  });
}
