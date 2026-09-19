import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { countUnreadNotifications } from "@/lib/notifications";

/** Polled by the bell badge — kept to a single cheap `count()` so it's fine
 * to hit often, separately from the full list (which only fetches on open). */
export async function GET() {
  const { userId, unauthorized } = await requireApiSession();
  if (unauthorized) {
    return unauthorized;
  }

  const count = await countUnreadNotifications(userId!);
  return NextResponse.json({ count });
}
