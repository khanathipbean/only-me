import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { markNotificationRead } from "@/lib/notifications";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { userId, unauthorized } = await requireApiSession();
  if (unauthorized) {
    return unauthorized;
  }

  const { id } = await context.params;
  // Scoped by recipientId inside markNotificationRead — a stranger's id here
  // just matches zero rows, never someone else's notification.
  await markNotificationRead(id, userId!);
  return NextResponse.json({ ok: true });
}
