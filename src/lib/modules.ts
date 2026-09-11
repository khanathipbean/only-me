import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { paginate, type PageFilters } from "@/lib/pagination";
import { setDeletedAt, type SoftDeleteAction } from "@/lib/soft-delete";

export class ModuleValidationError extends Error {}

/** Every live Module in the project, in the order the menu shows them. */
export async function listModulesForProject(projectId: string) {
  return prisma.module.findMany({
    where: { projectId, deletedAt: null },
    orderBy: [{ sequence: "asc" }, { name: "asc" }],
  });
}

export type ModuleFilters = {
  search?: string;
  archived?: boolean;
};

/** Shared by the plain and paginated lists so their results can't drift. */
function moduleWhere(projectId: string, filters: ModuleFilters) {
  return {
    projectId,
    deletedAt: filters.archived ? { not: null } : null,
    ...(filters.search
      ? { name: { contains: filters.search, mode: "insensitive" as const } }
      : {}),
  };
}

/* Live Requirements only — the same rule as the Requirement list's Scenario
 * count, so the number shown is the number the archive guard enforces. */
const WITH_REQUIREMENT_COUNT = {
  _count: { select: { requirements: { where: { deletedAt: null } } } },
} as const;

/** One page of the Modules list, for the table's pager. */
export async function listModulesForProjectPage(
  projectId: string,
  filters: ModuleFilters & PageFilters = {},
) {
  const where = moduleWhere(projectId, filters);
  return paginate(
    filters,
    () => prisma.module.count({ where }),
    ({ skip, take }) =>
      prisma.module.findMany({
        where,
        include: WITH_REQUIREMENT_COUNT,
        orderBy: [{ sequence: "asc" }, { name: "asc" }],
        skip,
        take,
      }),
  );
}

export async function getModuleById(id: string) {
  return prisma.module.findUnique({ where: { id } });
}

export async function createModule(projectId: string, name: string, actorId: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new ModuleValidationError("Module name is required");
  }

  const existing = await prisma.module.findUnique({
    where: { projectId_name: { projectId, name: trimmed } },
  });
  if (existing) {
    // Unique per project, so a repeat is almost always someone re-adding a
    // module they archived. Reviving it keeps the files and requirements
    // that still point at it attached.
    if (existing.deletedAt) {
      return setDeletedAt({
        entityType: "Module",
        actorId,
        action: "restore",
        deletedAt: null,
        projectId,
        update: (deletedAt) =>
          prisma.module.update({ where: { id: existing.id }, data: { deletedAt } }),
      });
    }
    throw new ModuleValidationError(`"${trimmed}" already exists in this project`);
  }

  const last = await prisma.module.findFirst({
    where: { projectId },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });

  const created = await prisma.module.create({
    data: { projectId, name: trimmed, sequence: (last?.sequence ?? -1) + 1 },
  });

  await writeAuditLog({
    entityType: "Module",
    entityId: created.id,
    action: "create",
    actorId,
    projectId,
    newValue: created,
  });

  return created;
}

export async function renameModule(id: string, name: string, actorId: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new ModuleValidationError("Module name is required");
  }
  const before = await prisma.module.findUniqueOrThrow({ where: { id } });
  const renamed = await prisma.module.update({ where: { id }, data: { name: trimmed } });

  await writeAuditLog({
    entityType: "Module",
    entityId: id,
    action: "update",
    actorId,
    projectId: before.projectId,
    oldValue: before,
    newValue: renamed,
  });

  return renamed;
}

export async function setModuleDeletedAt(
  id: string,
  deletedAt: Date | null,
  actorId: string,
  action: SoftDeleteAction,
) {
  const before = await prisma.module.findUniqueOrThrow({ where: { id } });
  return setDeletedAt({
    entityType: "Module",
    actorId,
    action,
    deletedAt,
    projectId: before.projectId,
    update: (deletedAt) => prisma.module.update({ where: { id }, data: { deletedAt } }),
  });
}

/**
 * Archives a Module, refusing while anything still points at it — a
 * Requirement or a file left behind would lose the heading it is filed
 * under, and nothing in the UI would show it had happened.
 */
export async function archiveModule(id: string, actorId: string) {
  const [requirements, files] = await Promise.all([
    prisma.requirement.count({ where: { moduleId: id, deletedAt: null } }),
    prisma.projectFile.count({ where: { moduleId: id, deletedAt: null } }),
  ]);
  if (requirements > 0 || files > 0) {
    throw new ModuleValidationError(
      `Still in use by ${requirements} requirement(s) and ${files} file(s). Move them first.`,
    );
  }
  return setModuleDeletedAt(id, new Date(), actorId, "archive");
}
