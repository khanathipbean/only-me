import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { markAllNotificationsRead } from "@/lib/notifications";

export async function POST() {
  const { userId, unauthorized } = await requireApiSession();
  if (unauthorized) {
    return unauthorized;
  }

  await markAllNotificationsRead(userId!);
  return NextResponse.json({ ok: true });
}
