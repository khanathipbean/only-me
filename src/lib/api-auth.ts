import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ForbiddenError, requireProjectRole } from "@/lib/rbac";
import type { ProjectRole } from "@/generated/prisma/client";

export async function requireApiSession() {
  const session = await auth();
  if (!session?.user) {
    return { userId: null, unauthorized: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { userId: session.user.id, unauthorized: null };
}

type ProjectRouteContext = { params: Promise<{ id: string }> };
type ProjectRouteHandler = (
  request: NextRequest,
  ctx: { userId: string; projectId: string },
) => Promise<NextResponse>;

/** Wraps a route handler that acts on one project: checks session + project role, then hands off. */
export function withProjectRole(
  roles: ProjectRole[],
  handler: ProjectRouteHandler,
) {
  return async (request: NextRequest, context: ProjectRouteContext) => {
    const { userId, unauthorized } = await requireApiSession();
    if (unauthorized) {
      return unauthorized;
    }

    const { id: projectId } = await context.params;

    try {
      await requireProjectRole(userId!, projectId, roles);
    } catch (error) {
      if (error instanceof ForbiddenError) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      throw error;
    }

    return handler(request, { userId: userId!, projectId });
  };
}
