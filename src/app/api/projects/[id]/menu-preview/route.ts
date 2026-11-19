import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { getProjectMembership } from "@/lib/rbac";
import { heldBy } from "@/lib/permissions";
import { getMenuPreview } from "@/lib/menu-preview";

/**
 * What the project's nav menus draw beside their lists.
 *
 * Not wrapped in `withCapability` like its neighbours, because this answers
 * for seven pages at once and they are not gated alike: a DEV may open the
 * Dashboard and none of the other three in that menu. The membership is read
 * once and `heldBy` turns it into the capability list, which is the same
 * answer the layout gives the tabs — so what the menu lists and what this
 * fills in cannot disagree.
 *
 * Membership at all is still the gate: a stranger with a project id gets 403
 * here exactly as they would from any page inside it.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { userId, unauthorized } = await requireApiSession();
  if (unauthorized) {
    return unauthorized;
  }

  const { id: projectId } = await context.params;
  const membership = await getProjectMembership(userId!, projectId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const preview = await getMenuPreview(projectId, await heldBy(membership.role));
  return NextResponse.json(preview);
}
