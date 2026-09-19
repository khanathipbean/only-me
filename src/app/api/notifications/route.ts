import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { listNotificationsForUser } from "@/lib/notifications";

export async function GET(request: Request) {
  const { userId, unauthorized } = await requireApiSession();
  if (unauthorized) {
    return unauthorized;
  }

  const { searchParams } = new URL(request.url);
  const page = searchParams.get("page");
  const pageSize = searchParams.get("pageSize");

  const result = await listNotificationsForUser(userId!, {
    unreadOnly: searchParams.get("unread") === "1",
    page: page ? Number(page) : undefined,
    pageSize: pageSize ? Number(pageSize) : undefined,
  });

  return NextResponse.json(result);
}
