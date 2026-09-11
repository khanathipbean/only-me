import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { paginate, type PageFilters } from "@/lib/pagination";
import { findOrCreateUnassignedRequirement } from "@/lib/requirements";
import { writeAuditLog } from "@/lib/audit";
import { setDeletedAt, type SoftDeleteAction } from "@/lib/soft-delete";
import type { Priority, WorkflowStatus } from "@/generated/prisma/client";

export class ValidationError extends Error {}
export class ConfirmRequiredError extends Error {
  constructor() {
    super("Deleting a Scenario requires confirm: true");
  }
}

export type ScenarioInput = {
  requirementId: string;
  name: string;
  description?: string | null;
  preconditions?: string | null;
  testData?: string | null;
  steps?: string | null;
  expectedResult: string;
  priority: Priority;
  status?: WorkflowStatus;
  tags?: string[];
  ownerId?: string | null;
};

function validateScenarioInput(input: Partial<ScenarioInput>) {
  if (!input.name || !input.expectedResult || !input.priority) {
    throw new ValidationError("name, expectedResult, and priority are required");
  }
}

async function logScenarioEvent(
  action: string,
  scenario: { id: string; projectId: string },
  actorId: string,
  values: { oldValue?: unknown; newValue?: unknown } = {},
) {
  await writeAuditLog({
    entityType: "Scenario",
    entityId: scenario.id,
    action,
    actorId,
    projectId: scenario.projectId,
    ...values,
  });
}

async function setScenarioDeletedAt(
  id: string,
  actorId: string,
  action: SoftDeleteAction,
  deletedAt: Date | null,
) {
  const before = await prisma.scenario.findUniqueOrThrow({ where: { id } });
  return setDeletedAt({
    entityType: "Scenario",
    actorId,
    action,
    deletedAt,
    projectId: before.projectId,
    update: (deletedAt) => prisma.scenario.update({ where: { id }, data: { deletedAt } }),
  });
}

export async function createScenario(
  projectId: string,
  input: ScenarioInput,
  actorId: string,
) {
  validateScenarioInput(input);
  if (!input.requirementId) {
    throw new ValidationError("requirementId is required");
  }

  const scenario = await prisma.scenario.create({
    data: {
      projectId,
      requirementId: input.requirementId,
      name: input.name,
      description: input.description ?? null,
      preconditions: input.preconditions ?? null,
      testData: input.testData ?? null,
      steps: input.steps ?? null,
      expectedResult: input.expectedResult,
      priority: input.priority,
      status: input.status ?? "DRAFT",
      tags: input.tags ?? [],
      ownerId: input.ownerId ?? null,
    },
  });

  await logScenarioEvent("create", scenario, actorId, { newValue: scenario });

  return scenario;
}

const SCENARIO_SORT_FIELDS = ["name", "priority", "status", "createdAt"] as const;
export type ScenarioSortField = (typeof SCENARIO_SORT_FIELDS)[number];

export function isScenarioSortField(value: string | null | undefined): value is ScenarioSortField {
  return SCENARIO_SORT_FIELDS.includes(value as ScenarioSortField);
}

export type ScenarioFilters = {
  search?: string;
  requirementId?: string;
  status?: WorkflowStatus;
  priority?: Priority;
  sortBy?: ScenarioSortField;
  sortOrder?: "asc" | "desc";
  /** Show archived Scenarios instead of live ones. Without this the list
   * can only ever show `deletedAt: null`, which — now that archiving is
   * driven from the list — would leave an archived Scenario unreachable and
   * make "restorable later" a lie. */
  archived?: boolean;
};

/** Shared by the plain and paginated lists so their results can't drift. */
function scenarioListWhere(projectId: string, filters: ScenarioFilters) {
  return {
    projectId,
    deletedAt: filters.archived ? { not: null } : null,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.requirementId ? { requirementId: filters.requirementId } : {}),
    ...(filters.search
      ? { name: { contains: filters.search, mode: "insensitive" as const } }
      : {}),
  };
}

function scenarioListOrder(filters: ScenarioFilters) {
  return { [filters.sortBy ?? "createdAt"]: filters.sortOrder ?? "desc" };
}

export async function listScenariosForProject(
  projectId: string,
  filters: ScenarioFilters = {},
) {
  return prisma.scenario.findMany({
    where: scenarioListWhere(projectId, filters),
    orderBy: scenarioListOrder(filters),
  });
}

/** One page of the same list. Kept separate so `/api/projects/[id]/scenarios`
 * and the "move to another Scenario" picker, which both need every row, are
 * unaffected. */
export async function listScenariosForProjectPage(
  projectId: string,
  filters: ScenarioFilters & PageFilters = {},
) {
  const where = scenarioListWhere(projectId, filters);
  return paginate(
    filters,
    () => prisma.scenario.count({ where }),
    ({ skip, take }) =>
      prisma.scenario.findMany({ where, orderBy: scenarioListOrder(filters), skip, take }),
  );
}

/** Wrapped in React's `cache` so `generateMetadata` and the page body, which
 * both need this record, share one query per request instead of two. */
export const getScenarioById = cache(async (id: string) => {
  return prisma.scenario.findUnique({ where: { id } });
});

/** A PATCH may leave the Requirement out; only a move states a new one. */
export type ScenarioUpdateInput = Omit<ScenarioInput, "requirementId"> & {
  requirementId?: string;
};

export async function updateScenario(
  id: string,
  input: ScenarioUpdateInput,
  actorId: string,
) {
  validateScenarioInput(input);

  const before = await prisma.scenario.findUniqueOrThrow({ where: { id } });

  const after = await prisma.scenario.update({
    where: { id },
    data: {
      requirementId: input.requirementId ?? before.requirementId,
      name: input.name,
      description: input.description ?? null,
      preconditions: input.preconditions ?? null,
      testData: input.testData ?? null,
      steps: input.steps ?? null,
      expectedResult: input.expectedResult,
      priority: input.priority,
      status: input.status ?? before.status,
      tags: input.tags ?? before.tags,
      ownerId: input.ownerId ?? before.ownerId,
    },
  });

  await logScenarioEvent("update", after, actorId, { oldValue: before, newValue: after });

  return after;
}

export async function duplicateScenario(id: string, actorId: string) {
  const source = await prisma.scenario.findUniqueOrThrow({ where: { id } });

  const copy = await prisma.scenario.create({
    data: {
      projectId: source.projectId,
      requirementId: source.requirementId,
      name: source.name,
      description: source.description,
      preconditions: source.preconditions,
      testData: source.testData,
      steps: source.steps,
      expectedResult: source.expectedResult,
      priority: source.priority,
      status: source.status,
      tags: source.tags,
      ownerId: source.ownerId,
    },
  });

  await logScenarioEvent("duplicate", copy, actorId, { newValue: copy });

  return copy;
}

/** Counts shown to the UI before a destructive or cross-project action. */
export async function getScenarioDescendantCounts(scenarioId: string) {
  const testGroups = await prisma.testGroup.findMany({
    where: { scenarioId, deletedAt: null },
    select: { id: true },
  });
  const testCases = await prisma.testCase.count({
    where: { testGroupId: { in: testGroups.map((tg) => tg.id) }, deletedAt: null },
  });
  return { testGroups: testGroups.length, testCases };
}

/**
 * Descendant counts for a whole page of Scenarios in two queries instead of
 * two per row. The list needs them to word each row's archive/delete
 * confirmation, and calling `getScenarioDescendantCounts` in a loop would be
 * 2N round trips to a remote database.
 */
export async function getScenarioDescendantCountsForMany(scenarioIds: string[]) {
  const counts = new Map<string, { testGroups: number; testCases: number }>(
    scenarioIds.map((id) => [id, { testGroups: 0, testCases: 0 }]),
  );
  if (scenarioIds.length === 0) {
    return counts;
  }

  const testGroups = await prisma.testGroup.findMany({
    where: { scenarioId: { in: scenarioIds }, deletedAt: null },
    select: { id: true, scenarioId: true },
  });
  for (const testGroup of testGroups) {
    counts.get(testGroup.scenarioId)!.testGroups += 1;
  }

  const perTestGroup = await prisma.testCase.groupBy({
    by: ["testGroupId"],
    where: { testGroupId: { in: testGroups.map((tg) => tg.id) }, deletedAt: null },
    _count: { _all: true },
  });
  const scenarioIdByTestGroupId = new Map(testGroups.map((tg) => [tg.id, tg.scenarioId]));
  for (const row of perTestGroup) {
    const scenarioId = scenarioIdByTestGroupId.get(row.testGroupId)!;
    counts.get(scenarioId)!.testCases += row._count._all;
  }

  return counts;
}

export async function archiveScenario(id: string, actorId: string) {
  const [scenario, descendantCounts] = await Promise.all([
    setScenarioDeletedAt(id, actorId, "archive", new Date()),
    getScenarioDescendantCounts(id),
  ]);
  return { ...scenario, descendantCounts };
}

export async function restoreScenario(id: string, actorId: string) {
  return setScenarioDeletedAt(id, actorId, "restore", null);
}

export async function deleteScenario(id: string, actorId: string, confirm: boolean) {
  if (!confirm) {
    throw new ConfirmRequiredError();
  }
  const [scenario, descendantCounts] = await Promise.all([
    setScenarioDeletedAt(id, actorId, "delete", new Date()),
    getScenarioDescendantCounts(id),
  ]);
  return { ...scenario, descendantCounts };
}

/**
 * The ancestor ids a Scenario's URL needs. Every page below a Scenario has
 * only its own id to work from once a move lands it under a different
 * Requirement, so the path is resolved from the row rather than assumed.
 */
export async function getScenarioLocation(scenarioId: string) {
  const scenario = await prisma.scenario.findUnique({
    where: { id: scenarioId },
    select: {
      id: true,
      projectId: true,
      requirementId: true,
      requirement: { select: { moduleId: true } },
    },
  });
  if (!scenario) {
    return null;
  }
  return {
    projectId: scenario.projectId,
    moduleId: scenario.requirement.moduleId,
    requirementId: scenario.requirementId,
    scenarioId: scenario.id,
  };
}

export async function moveScenario(id: string, targetProjectId: string, actorId: string) {
  const before = await prisma.scenario.findUniqueOrThrow({ where: { id } });

  /* Its Requirement belongs to the project it is leaving. Carrying that
   * across would put the Scenario under another project's Module, where its
   * own project's URL can't reach it, so it is re-filed on arrival. */
  const requirementId = await findOrCreateUnassignedRequirement(targetProjectId, actorId);

  const scenario = await prisma.scenario.update({
    where: { id },
    data: { projectId: targetProjectId, requirementId },
  });

  await logScenarioEvent("move", scenario, actorId, {
    oldValue: { projectId: before.projectId, requirementId: before.requirementId },
    newValue: { projectId: targetProjectId, requirementId },
  });

  const descendantCounts = await getScenarioDescendantCounts(id);
  return { ...scenario, descendantCounts };
}
