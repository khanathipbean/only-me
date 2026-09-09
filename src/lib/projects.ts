import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import type { ProjectRole, ProjectStatus } from "@/generated/prisma/client";

export class ValidationError extends Error {}
export class DuplicateCodeError extends Error {
  constructor() {
    super("Project code already exists");
  }
}

export type ProjectInput = {
  code: string;
  name: string;
  description?: string | null;
  status: ProjectStatus;
  startDate?: Date | null;
  endDate?: Date | null;
};

function validateProjectInput(input: Partial<ProjectInput>) {
  if (!input.code || !input.name || !input.status) {
    throw new ValidationError("code, name, and status are required");
  }
  if (input.startDate && input.endDate && input.endDate < input.startDate) {
    throw new ValidationError("endDate must not be before startDate");
  }
}

export async function createProject(input: ProjectInput, ownerId: string) {
  validateProjectInput(input);

  const existing = await prisma.project.findUnique({ where: { code: input.code } });
  if (existing) {
    throw new DuplicateCodeError();
  }

  const project = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: {
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        status: input.status,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        ownerId,
        updatedById: ownerId,
      },
    });

    await tx.projectMember.create({
      data: { projectId: created.id, userId: ownerId, role: "QA_LEAD" },
    });

    return created;
  });

  await writeAuditLog({
    entityType: "Project",
    entityId: project.id,
    action: "create",
    actorId: ownerId,
    projectId: project.id,
    newValue: project,
  });

  return project;
}

export async function listProjectsForUser(
  userId: string,
  filters: { search?: string; status?: ProjectStatus; owner?: string } = {},
) {
  return prisma.project.findMany({
    where: {
      deletedAt: null,
      members: { some: { userId } },
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.owner ? { ownerId: filters.owner } : {}),
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: "insensitive" } },
              { code: { contains: filters.search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Projects where the user holds one of `roles` — used to populate "move to another Project"
 * pickers, where moving actually requires editor-level membership on the target. */
export async function listProjectsForUserWithRole(userId: string, roles: ProjectRole[]) {
  return prisma.project.findMany({
    where: {
      deletedAt: null,
      members: { some: { userId, role: { in: roles } } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getProjectById(id: string) {
  return prisma.project.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      updatedBy: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function updateProject(
  id: string,
  input: ProjectInput,
  actorId: string,
) {
  validateProjectInput(input);

  const before = await prisma.project.findUniqueOrThrow({ where: { id } });

  if (input.code !== before.code) {
    const existing = await prisma.project.findUnique({ where: { code: input.code } });
    if (existing) {
      throw new DuplicateCodeError();
    }
  }

  const after = await prisma.project.update({
    where: { id },
    data: {
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      status: input.status,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      updatedById: actorId,
    },
  });

  await writeAuditLog({
    entityType: "Project",
    entityId: id,
    action: "update",
    actorId,
    projectId: id,
    oldValue: before,
    newValue: after,
  });

  return after;
}

export async function archiveProject(id: string, actorId: string) {
  const project = await prisma.project.update({
    where: { id },
    data: { deletedAt: new Date(), updatedById: actorId },
  });

  await writeAuditLog({
    entityType: "Project",
    entityId: id,
    action: "archive",
    actorId,
    projectId: id,
  });

  return project;
}

export async function restoreProject(id: string, actorId: string) {
  const project = await prisma.project.update({
    where: { id },
    data: { deletedAt: null, updatedById: actorId },
  });

  await writeAuditLog({
    entityType: "Project",
    entityId: id,
    action: "restore",
    actorId,
    projectId: id,
  });

  return project;
}
