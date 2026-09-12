import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { ProjectRole } from "@/generated/prisma/client";

export const ADMIN_ROLES: ProjectRole[] = ["ADMIN"];
export const EDITOR_ROLES: ProjectRole[] = ["ADMIN", "QA_LEAD"];
export const ALL_MEMBER_ROLES: ProjectRole[] = [
  "ADMIN",
  "QA_LEAD",
  "TESTER",
  "VIEWER",
];

export class ForbiddenError extends Error {
  constructor() {
    super("Forbidden");
    this.name = "ForbiddenError";
  }
}

export async function getProjectMembership(userId: string, projectId: string) {
  return prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
}

/** Whether this account holds ADMIN on at least one Project — there's no
 * global admin flag, so this is the closest proxy for "a privileged account"
 * when a check isn't scoped to any one project (e.g. showing "+ New Project",
 * or the global Members page — an ADMIN elsewhere must be able to add
 * members to a brand-new Project, since its creator only starts as QA_LEAD). */
export async function isAdminAnywhere(userId: string): Promise<boolean> {
  const membership = await prisma.projectMember.findFirst({
    where: { userId, role: "ADMIN" },
    select: { id: true },
  });
  return Boolean(membership);
}

/** For server components/actions gating something that isn't scoped to one
 * Project (see `isAdminAnywhere`) — a non-admin sees a 404, same as
 * `requireProjectRoleOrNotFound`. */
export async function requireAdminAnywhereOrNotFound(userId: string) {
  if (!(await isAdminAnywhere(userId))) {
    notFound();
  }
}

export async function requireProjectRole(
  userId: string,
  projectId: string,
  allowedRoles: ProjectRole[],
) {
  const membership = await getProjectMembership(userId, projectId);
  if (!membership || !allowedRoles.includes(membership.role)) {
    throw new ForbiddenError();
  }
  return membership;
}

/** For server components/actions: same check, but a forbidden caller sees a 404 instead of an unhandled throw. */
export async function requireProjectRoleOrNotFound(
  userId: string,
  projectId: string,
  allowedRoles: ProjectRole[],
) {
  try {
    return await requireProjectRole(userId, projectId, allowedRoles);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      notFound();
    }
    throw error;
  }
}
