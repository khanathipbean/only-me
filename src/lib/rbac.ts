import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { ProjectRole } from "@/generated/prisma/client";

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
