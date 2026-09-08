import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ForbiddenError, requireProjectRole } from "@/lib/rbac";
import type { ProjectMember, ProjectRole } from "@/generated/prisma/client";

export async function requireApiSession() {
  const session = await auth();
  if (!session?.user) {
    return { userId: null, unauthorized: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { userId: session.user.id, unauthorized: null };
}

/**
 * Checks the caller's role on `projectId`. Returns the resolved `membership`
 * (so callers don't have to re-fetch it) on success, or a 403 `forbidden`
 * response otherwise.
 */
export async function checkProjectRole(userId: string, projectId: string, roles: ProjectRole[]) {
  try {
    const membership = await requireProjectRole(userId, projectId, roles);
    return { membership, forbidden: null as NextResponse | null };
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return {
        membership: null as ProjectMember | null,
        forbidden: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      };
    }
    throw error;
  }
}

type ProjectRouteContext = { params: Promise<{ id: string }> };
type ProjectRouteHandler = (
  request: NextRequest,
  ctx: { userId: string; projectId: string; membership: ProjectMember },
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

    const { membership, forbidden } = await checkProjectRole(userId!, projectId, roles);
    if (forbidden) {
      return forbidden;
    }

    return handler(request, { userId: userId!, projectId, membership: membership! });
  };
}

type EntityRouteContext = { params: Promise<{ id: string }> };
type EntityRouteHandler<T> = (
  request: NextRequest,
  ctx: { userId: string; entityId: string; projectId: string; entity: T; membership: ProjectMember },
) => Promise<NextResponse>;

/**
 * Wraps a route handler that acts on an entity identified only by its own id
 * (e.g. a Scenario), not a projectId in the URL: resolves the entity, checks
 * the caller's role on the project it belongs to, then hands off.
 */
export function withEntityProjectRole<T extends { projectId: string }>(
  roles: ProjectRole[],
  resolveEntity: (id: string) => Promise<T | null>,
  handler: EntityRouteHandler<T>,
) {
  return async (request: NextRequest, context: EntityRouteContext) => {
    const { userId, unauthorized } = await requireApiSession();
    if (unauthorized) {
      return unauthorized;
    }

    const { id: entityId } = await context.params;
    const entity = await resolveEntity(entityId);
    if (!entity) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { membership, forbidden } = await checkProjectRole(userId!, entity.projectId, roles);
    if (forbidden) {
      return forbidden;
    }

    return handler(request, {
      userId: userId!,
      entityId,
      projectId: entity.projectId,
      entity,
      membership: membership!,
    });
  };
}
