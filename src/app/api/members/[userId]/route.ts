import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { isAdminAnywhere } from "@/lib/rbac";
import { ValidationError, updateUserProjectAccess } from "@/lib/members";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const { userId: actorId, unauthorized } = await requireApiSession();
  if (unauthorized) {
    return unauthorized;
  }
  if (!(await isAdminAnywhere(actorId!))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId } = await context.params;
  const body = await request.json();

  try {
    await updateUserProjectAccess(userId, body.access, actorId!);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
