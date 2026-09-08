import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import type { ScenarioPriority, ScenarioStatus } from "@/generated/prisma/client";

export class ValidationError extends Error {}
export class ConfirmRequiredError extends Error {
  constructor() {
    super("Deleting a Scenario requires confirm: true");
  }
}

export type ScenarioInput = {
  name: string;
  description?: string | null;
  preconditions?: string | null;
  testData?: string | null;
  steps?: string | null;
  expectedResult: string;
  priority: ScenarioPriority;
  status?: ScenarioStatus;
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
  action: "archive" | "restore" | "delete",
  deletedAt: Date | null,
) {
  const scenario = await prisma.scenario.update({ where: { id }, data: { deletedAt } });
  await logScenarioEvent(action, scenario, actorId);
  return scenario;
}

export async function createScenario(
  projectId: string,
  input: ScenarioInput,
  actorId: string,
) {
  validateScenarioInput(input);

  const scenario = await prisma.scenario.create({
    data: {
      projectId,
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

export async function listScenariosForProject(
  projectId: string,
  filters: {
    search?: string;
    status?: ScenarioStatus;
    priority?: ScenarioPriority;
    sortBy?: ScenarioSortField;
    sortOrder?: "asc" | "desc";
  } = {},
) {
  return prisma.scenario.findMany({
    where: {
      projectId,
      deletedAt: null,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.priority ? { priority: filters.priority } : {}),
      ...(filters.search
        ? { name: { contains: filters.search, mode: "insensitive" } }
        : {}),
    },
    orderBy: { [filters.sortBy ?? "createdAt"]: filters.sortOrder ?? "desc" },
  });
}

export async function getScenarioById(id: string) {
  return prisma.scenario.findUnique({ where: { id } });
}

export async function updateScenario(
  id: string,
  input: ScenarioInput,
  actorId: string,
) {
  validateScenarioInput(input);

  const before = await prisma.scenario.findUniqueOrThrow({ where: { id } });

  const after = await prisma.scenario.update({
    where: { id },
    data: {
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

export async function archiveScenario(id: string, actorId: string) {
  return setScenarioDeletedAt(id, actorId, "archive", new Date());
}

export async function restoreScenario(id: string, actorId: string) {
  return setScenarioDeletedAt(id, actorId, "restore", null);
}

export async function deleteScenario(id: string, actorId: string, confirm: boolean) {
  if (!confirm) {
    throw new ConfirmRequiredError();
  }
  return setScenarioDeletedAt(id, actorId, "delete", new Date());
}
