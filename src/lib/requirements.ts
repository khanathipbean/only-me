import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { paginate, type PageFilters } from "@/lib/pagination";
import { setDeletedAt, type SoftDeleteAction } from "@/lib/soft-delete";
import type { Priority, WorkflowStatus } from "@/generated/prisma/client";

export class RequirementValidationError extends Error {}

/** Where rows with no Module/Requirement of their own land — one name shared
 *  by the backfill, the CSV import and a cross-project move. */
export const UNASSIGNED_NAME = "Unassigned";

/**
 * The Requirement a Scenario is filed under when it arrives in a project
 * without one of its own — currently a cross-project move, whose Requirement
 * belongs to the project it came from.
 */
export async function findOrCreateUnassignedRequirement(projectId: string, actorId: string) {
  const existing = await prisma.requirement.findFirst({
    where: { projectId, name: UNASSIGNED_NAME, deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    return existing.id;
  }

  const maxSequence = await prisma.module.aggregate({
    where: { projectId },
    _max: { sequence: true },
  });
  const target = await prisma.module.upsert({
    where: { projectId_name: { projectId, name: UNASSIGNED_NAME } },
    update: { deletedAt: null },
    create: {
      projectId,
      name: UNASSIGNED_NAME,
      sequence: (maxSequence._max.sequence ?? -1) + 1,
    },
  });

  return (
    await createRequirement(
      projectId,
      { name: UNASSIGNED_NAME, moduleId: target.id, priority: "MEDIUM" },
      actorId,
    )
  ).id;
}

export type RequirementInput = {
  name: string;
  code?: string | null;
  description?: string | null;
  moduleId: string;
  priority: Priority;
  status?: WorkflowStatus;
};

function validate(input: RequirementInput) {
  if (!input.name?.trim()) {
    throw new RequirementValidationError("Requirement name is required");
  }
  if (!input.priority) {
    throw new RequirementValidationError("Priority is required");
  }
  if (!input.moduleId) {
    throw new RequirementValidationError("Module is required");
  }
}

export type RequirementFilters = {
  search?: string;
  status?: WorkflowStatus;
  priority?: Priority;
  moduleId?: string;
  archived?: boolean;
};

/** Shared by the plain and paginated lists so their results can't drift. */
function requirementWhere(projectId: string, filters: RequirementFilters) {
  return {
    projectId,
    deletedAt: filters.archived ? { not: null } : null,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.moduleId ? { moduleId: filters.moduleId } : {}),
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

const WITH_MODULE_AND_COUNT = {
  module: { select: { id: true, name: true, sequence: true } },
  /* Live Scenarios only. An unfiltered count includes archived ones, so the
   * list would promise "5 scenarios" while archiving the Requirement is
   * refused for carrying 2 — two different numbers for the same question. */
  _count: { select: { scenarios: { where: { deletedAt: null } } } },
} as const;

export async function listRequirementsForProject(
  projectId: string,
  filters: RequirementFilters = {},
) {
  return prisma.requirement.findMany({
    where: requirementWhere(projectId, filters),
    include: WITH_MODULE_AND_COUNT,
    orderBy: [{ module: { sequence: "asc" } }, { code: "asc" }, { createdAt: "desc" }],
  });
}

/** One page of the same list, for the table's pager. */
export async function listRequirementsForProjectPage(
  projectId: string,
  filters: RequirementFilters & PageFilters = {},
) {
  const where = requirementWhere(projectId, filters);
  return paginate(
    filters,
    () => prisma.requirement.count({ where }),
    ({ skip, take }) =>
      prisma.requirement.findMany({
        where,
        include: WITH_MODULE_AND_COUNT,
        orderBy: [{ module: { sequence: "asc" } }, { code: "asc" }, { createdAt: "desc" }],
        skip,
        take,
      }),
  );
}

export async function getRequirementById(id: string) {
  return prisma.requirement.findUnique({ where: { id }, include: WITH_MODULE_AND_COUNT });
}

export async function createRequirement(
  projectId: string,
  input: RequirementInput,
  actorId: string,
) {
  validate(input);
  const requirement = await prisma.requirement.create({
    data: {
      projectId,
      name: input.name.trim(),
      code: input.code?.trim() || null,
      description: input.description || null,
      moduleId: input.moduleId,
      priority: input.priority,
      status: input.status ?? "DRAFT",
    },
  });

  await writeAuditLog({
    entityType: "Requirement",
    entityId: requirement.id,
    action: "create",
    actorId,
    projectId,
    newValue: requirement,
  });

  return requirement;
}

export async function updateRequirement(
  id: string,
  input: RequirementInput,
  actorId: string,
) {
  validate(input);
  const before = await prisma.requirement.findUniqueOrThrow({ where: { id } });
  const requirement = await prisma.requirement.update({
    where: { id },
    data: {
      name: input.name.trim(),
      code: input.code?.trim() || null,
      description: input.description || null,
      moduleId: input.moduleId,
      priority: input.priority,
      status: input.status ?? "DRAFT",
    },
  });

  await writeAuditLog({
    entityType: "Requirement",
    entityId: requirement.id,
    action: "update",
    actorId,
    projectId: requirement.projectId,
    oldValue: before,
    newValue: requirement,
  });

  return requirement;
}

export async function setRequirementDeletedAt(
  id: string,
  deletedAt: Date | null,
  actorId: string,
  action: SoftDeleteAction,
) {
  const before = await prisma.requirement.findUniqueOrThrow({ where: { id } });
  return setDeletedAt({
    entityType: "Requirement",
    actorId,
    action,
    deletedAt,
    projectId: before.projectId,
    update: (deletedAt) => prisma.requirement.update({ where: { id }, data: { deletedAt } }),
  });
}

/**
 * Refuses while Scenarios still hang off it. They'd keep a `requirementId`
 * pointing at something archived and vanish from the hierarchy with nothing
 * saying why — the same reason archiving a Module in use is refused.
 */
export async function archiveRequirement(id: string, actorId: string) {
  const scenarios = await prisma.scenario.count({ where: { requirementId: id, deletedAt: null } });
  if (scenarios > 0) {
    throw new RequirementValidationError(
      `Still carries ${scenarios} Scenario(s). Move or archive them first.`,
    );
  }
  return setRequirementDeletedAt(id, new Date(), actorId, "archive");
}
