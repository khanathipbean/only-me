import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { countUnreadNotifications } from "@/lib/notifications";
import { notifyOverdueWork } from "@/lib/work";

/**
 * Polled by the bell badge — kept cheap so it's fine to hit often, separately
 * from the full list (which only fetches on open).
 *
 * It also writes, which a GET is not supposed to do. That is deliberate and
 * is the whole reason overdue repairs can be announced at all: this app has
 * no scheduled job, and this poll is the only thing in it that runs on a
 * rhythm without one. The write is idempotent and touches only the caller's
 * own rows — see `notifyOverdueWork`, which explains what the trade costs.
 *
 * The usual case is one indexed lookup that finds nothing.
 */
export async function GET() {
  const { userId, unauthorized } = await requireApiSession();
  if (unauthorized) {
    return unauthorized;
  }

  await notifyOverdueWork(userId!);

  const count = await countUnreadNotifications(userId!);
  return NextResponse.json({ count });
}
