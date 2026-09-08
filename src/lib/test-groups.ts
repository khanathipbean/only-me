import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import type { WorkflowStatus } from "@/generated/prisma/client";

export class ValidationError extends Error {}
export class ConfirmRequiredError extends Error {
  constructor() {
    super("Deleting a Test Group requires confirm: true");
  }
}

export type TestGroupInput = {
  name: string;
  description?: string | null;
  testObjective?: string | null;
  status?: WorkflowStatus;
  ownerId?: string | null;
};

function validateTestGroupInput(input: Partial<TestGroupInput>) {
  if (!input.name) {
    throw new ValidationError("name is required");
  }
}

async function resolveProjectId(scenarioId: string) {
  const scenario = await prisma.scenario.findUniqueOrThrow({
    where: { id: scenarioId },
    select: { projectId: true },
  });
  return scenario.projectId;
}

async function logTestGroupEvent(
  action: string,
  testGroup: { id: string },
  projectId: string,
  actorId: string,
  values: { oldValue?: unknown; newValue?: unknown } = {},
) {
  await writeAuditLog({
    entityType: "TestGroup",
    entityId: testGroup.id,
    action,
    actorId,
    projectId,
    ...values,
  });
}

async function setTestGroupDeletedAt(
  id: string,
  actorId: string,
  action: "archive" | "restore" | "delete",
  deletedAt: Date | null,
) {
  const before = await prisma.testGroup.findUniqueOrThrow({
    where: { id },
    include: { scenario: { select: { projectId: true } } },
  });
  const testGroup = await prisma.testGroup.update({ where: { id }, data: { deletedAt } });
  await logTestGroupEvent(action, testGroup, before.scenario.projectId, actorId);
  return testGroup;
}

export async function createTestGroup(
  scenarioId: string,
  input: TestGroupInput,
  actorId: string,
) {
  validateTestGroupInput(input);

  const projectId = await resolveProjectId(scenarioId);

  const maxSequence = await prisma.testGroup.aggregate({
    where: { scenarioId },
    _max: { sequence: true },
  });

  const testGroup = await prisma.testGroup.create({
    data: {
      scenarioId,
      name: input.name,
      description: input.description ?? null,
      testObjective: input.testObjective ?? null,
      status: input.status ?? "DRAFT",
      ownerId: input.ownerId ?? null,
      sequence: (maxSequence._max.sequence ?? 0) + 1,
    },
  });

  await logTestGroupEvent("create", testGroup, projectId, actorId, { newValue: testGroup });

  return testGroup;
}

export async function listTestGroupsForScenario(scenarioId: string) {
  return prisma.testGroup.findMany({
    where: { scenarioId, deletedAt: null },
    orderBy: { sequence: "asc" },
  });
}

export async function getTestGroupById(id: string) {
  return prisma.testGroup.findUnique({ where: { id } });
}

/** Resolves { projectId } for a Test Group id, for RBAC checks that only know the parent Project. */
export async function getTestGroupWithProjectId(id: string) {
  const testGroup = await prisma.testGroup.findUnique({
    where: { id },
    include: { scenario: { select: { projectId: true } } },
  });
  if (!testGroup) {
    return null;
  }
  return { ...testGroup, projectId: testGroup.scenario.projectId };
}

export async function updateTestGroup(
  id: string,
  input: TestGroupInput,
  actorId: string,
) {
  validateTestGroupInput(input);

  const before = await prisma.testGroup.findUniqueOrThrow({
    where: { id },
    include: { scenario: { select: { projectId: true } } },
  });

  const after = await prisma.testGroup.update({
    where: { id },
    data: {
      name: input.name,
      description: input.description ?? null,
      testObjective: input.testObjective ?? null,
      status: input.status ?? before.status,
      ownerId: input.ownerId ?? before.ownerId,
    },
  });

  await logTestGroupEvent("update", after, before.scenario.projectId, actorId, {
    oldValue: before,
    newValue: after,
  });

  return after;
}

export class InvalidReorderError extends Error {
  constructor() {
    super("orderedIds must be exactly the Test Groups belonging to this Scenario");
  }
}

export async function reorderTestGroups(
  scenarioId: string,
  orderedIds: string[],
  actorId: string,
) {
  const projectId = await resolveProjectId(scenarioId);

  const existing = await prisma.testGroup.findMany({
    where: { scenarioId },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((tg) => tg.id));
  const sameMembers =
    orderedIds.length === existingIds.size && orderedIds.every((id) => existingIds.has(id));
  if (!sameMembers) {
    throw new InvalidReorderError();
  }

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.testGroup.update({
        where: { id },
        data: { sequence: index + 1 },
      }),
    ),
  );

  await writeAuditLog({
    entityType: "Scenario",
    entityId: scenarioId,
    action: "reorder-test-groups",
    actorId,
    projectId,
    newValue: { orderedIds },
  });

  return listTestGroupsForScenario(scenarioId);
}

export async function duplicateTestGroup(id: string, actorId: string) {
  const source = await prisma.testGroup.findUniqueOrThrow({
    where: { id },
    include: { scenario: { select: { projectId: true } } },
  });

  const maxSequence = await prisma.testGroup.aggregate({
    where: { scenarioId: source.scenarioId },
    _max: { sequence: true },
  });

  const copy = await prisma.testGroup.create({
    data: {
      scenarioId: source.scenarioId,
      name: source.name,
      description: source.description,
      testObjective: source.testObjective,
      status: source.status,
      ownerId: source.ownerId,
      sequence: (maxSequence._max.sequence ?? 0) + 1,
    },
  });

  await logTestGroupEvent("duplicate", copy, source.scenario.projectId, actorId, {
    newValue: copy,
  });

  return copy;
}

export async function archiveTestGroup(id: string, actorId: string) {
  return setTestGroupDeletedAt(id, actorId, "archive", new Date());
}

export async function restoreTestGroup(id: string, actorId: string) {
  return setTestGroupDeletedAt(id, actorId, "restore", null);
}

export async function deleteTestGroup(id: string, actorId: string, confirm: boolean) {
  if (!confirm) {
    throw new ConfirmRequiredError();
  }
  return setTestGroupDeletedAt(id, actorId, "delete", new Date());
}
