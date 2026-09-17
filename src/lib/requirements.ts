import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { paginate, type PageFilters } from "@/lib/pagination";
import { setDeletedAt, type SoftDeleteAction } from "@/lib/soft-delete";
import type { Priority, WorkflowStatus } from "@/generated/prisma/client";

export class RequirementValidationError extends Error {}
export class ConfirmRequiredError extends Error {
  constructor() {
    super("Deleting a Requirement requires confirm: true");
  }
}

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
  /** Optional sub-grouping inside the Module. */
  feature?: string | null;
  priority: Priority;
  status?: WorkflowStatus;
};

/** Every distinct Feature already used in a Module, for the picker. */
export async function listFeaturesForModule(moduleId: string) {
  const rows = await prisma.requirement.findMany({
    where: { moduleId, deletedAt: null, feature: { not: null } },
    select: { feature: true },
    distinct: ["feature"],
    orderBy: { feature: "asc" },
  });
  return rows.map((row) => row.feature as string);
}

/**
 * Keeps "Policy Center" and "policy center" from becoming two groups: if the
 * Module already knows a Feature that differs only in case or padding, the
 * existing spelling wins. Free text drifts otherwise — the same reason this
 * project stopped storing a file's Module as free text.
 */
async function normalizeFeature(moduleId: string, raw: string | null | undefined) {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return null;
  }
  const known = await listFeaturesForModule(moduleId);
  return known.find((value) => value.toLowerCase() === trimmed.toLowerCase()) ?? trimmed;
}

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
  feature?: string;
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
    ...(filters.feature ? { feature: filters.feature } : {}),
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
      feature: await normalizeFeature(input.moduleId, input.feature),
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

  /* The Module id arrives from a form field, and a form field is whatever the
   * request says it is. The picker only ever offers this Project's Modules, so
   * nothing in the UI can reach another one — but nothing stopped a crafted
   * request either, and a Requirement filed under another Project's Module
   * would keep this Project's `projectId` and show up in both. */
  const targetModule = await prisma.module.findFirst({
    where: { id: input.moduleId, projectId: before.projectId, deletedAt: null },
    select: { id: true },
  });
  if (!targetModule) {
    throw new RequirementValidationError("That Module is not in this project");
  }

  const requirement = await prisma.requirement.update({
    where: { id },
    data: {
      name: input.name.trim(),
      code: input.code?.trim() || null,
      description: input.description || null,
      moduleId: input.moduleId,
      // Against the Module it is moving to, not the one it came from.
      feature: await normalizeFeature(input.moduleId, input.feature),
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

/** Shared by archive and delete: both refuse while Scenarios still hang off
 * this Requirement. They'd keep a `requirementId` pointing at something gone
 * and vanish from the hierarchy with nothing saying why — the same reason
 * archiving a Module in use is refused. */
async function assertRequirementNotInUse(id: string) {
  const scenarios = await prisma.scenario.count({ where: { requirementId: id, deletedAt: null } });
  if (scenarios > 0) {
    throw new RequirementValidationError(
      `Still carries ${scenarios} Scenario(s). Move or archive them first.`,
    );
  }
}

export async function archiveRequirement(id: string, actorId: string) {
  await assertRequirementNotInUse(id);
  return setRequirementDeletedAt(id, new Date(), actorId, "archive");
}

export async function restoreRequirement(id: string, actorId: string) {
  return setRequirementDeletedAt(id, null, actorId, "restore");
}

export async function deleteRequirement(id: string, actorId: string, confirm: boolean) {
  if (!confirm) {
    throw new ConfirmRequiredError();
  }
  await assertRequirementNotInUse(id);
  return setRequirementDeletedAt(id, new Date(), actorId, "delete");
}
