import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { paginate, type PageFilters } from "@/lib/pagination";
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

export type ProjectFilters = { search?: string; status?: ProjectStatus };

/** Shared by the plain and paginated lists so their results can't drift. */
function projectListWhere(userId: string, filters: ProjectFilters) {
  return {
    deletedAt: null,
    members: { some: { userId } },
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.search
      ? {
          OR: [
            { name: { contains: filters.search, mode: "insensitive" as const } },
            { code: { contains: filters.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}

export async function listProjectsForUser(userId: string, filters: ProjectFilters = {}) {
  return prisma.project.findMany({
    where: projectListWhere(userId, filters),
    orderBy: { createdAt: "desc" },
  });
}

/**
 * One page of the same list, plus the counts the table's pager needs. A
 * separate function rather than an option on the one above: that one is what
 * `/api/projects` returns, and its response shouldn't grow paging metadata.
 */
export async function listProjectsForUserPage(
  userId: string,
  filters: ProjectFilters & PageFilters = {},
) {
  const where = projectListWhere(userId, filters);
  return paginate(
    filters,
    () => prisma.project.count({ where }),
    ({ skip, take }) =>
      prisma.project.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
  );
}

/** Every Project in the system, membership aside — used only to populate the
 * "Project" field on the global Members page, where an ADMIN on one Project
 * has to be able to add someone to a Project they aren't a member of yet
 * (a brand-new one, say, whose creator only starts as QA_LEAD). */
export async function listAllProjectsForPicker() {
  return prisma.project.findMany({
    where: { deletedAt: null },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
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

/** Wrapped in React's `cache` so `generateMetadata` and the page body, which
 * both need this record, share one query per request instead of two. */
export const getProjectById = cache(async (id: string) => {
  return prisma.project.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      updatedBy: { select: { id: true, name: true, email: true } },
    },
  });
});

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
