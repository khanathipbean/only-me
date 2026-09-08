import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { setDeletedAt, type SoftDeleteAction } from "@/lib/soft-delete";
import type { Priority, TestResult, TestType, WorkflowStatus } from "@/generated/prisma/client";

export class ValidationError extends Error {}
export class ConfirmRequiredError extends Error {
  constructor() {
    super("Deleting a Test Case requires confirm: true");
  }
}
/** A Tester (or any caller) sent a field in the request body they aren't allowed to change. */
export class RestrictedFieldError extends Error {
  constructor(fields: string[]) {
    super(`Not allowed to change: ${fields.join(", ")}`);
  }
}

export type TestStepInput = { step: string; expectedResult: string };

export type TestCaseInput = {
  name: string;
  condition?: string | null;
  preconditions?: string | null;
  testData?: string | null;
  expectedResult: string;
  priority: Priority;
  testType?: TestType | null;
  status?: WorkflowStatus;
  steps: TestStepInput[];
};

function validateTestCaseInput(input: Partial<TestCaseInput>) {
  if (!input.name || !input.expectedResult || !input.priority) {
    throw new ValidationError("name, expectedResult, and priority are required");
  }
  if (!input.steps || input.steps.length === 0) {
    throw new ValidationError("at least one Test Step is required");
  }
  for (const step of input.steps) {
    if (!step.step || !step.expectedResult) {
      throw new ValidationError("every Test Step needs its own step and expectedResult");
    }
  }
}

async function resolveProjectIdForTestGroup(testGroupId: string) {
  const testGroup = await prisma.testGroup.findUniqueOrThrow({
    where: { id: testGroupId },
    include: { scenario: { select: { projectId: true } } },
  });
  return testGroup.scenario.projectId;
}

async function logTestCaseEvent(
  action: string,
  testCase: { id: string },
  projectId: string,
  actorId: string,
  values: { oldValue?: unknown; newValue?: unknown } = {},
) {
  await writeAuditLog({
    entityType: "TestCase",
    entityId: testCase.id,
    action,
    actorId,
    projectId,
    ...values,
  });
}

async function setTestCaseDeletedAt(
  id: string,
  actorId: string,
  action: SoftDeleteAction,
  deletedAt: Date | null,
) {
  const before = await getTestCaseWithProjectId(id);
  if (!before) {
    throw new Error("Test Case not found");
  }
  return setDeletedAt({
    entityType: "TestCase",
    actorId,
    action,
    deletedAt,
    projectId: before.projectId,
    update: (deletedAt) =>
      prisma.testCase.update({ where: { id }, data: { deletedAt, updatedById: actorId } }),
  });
}

export async function createTestCase(
  testGroupId: string,
  input: TestCaseInput,
  actorId: string,
) {
  validateTestCaseInput(input);
  const projectId = await resolveProjectIdForTestGroup(testGroupId);

  const testCase = await prisma.$transaction(async (tx) => {
    const created = await tx.testCase.create({
      data: {
        testGroupId,
        name: input.name,
        condition: input.condition ?? null,
        preconditions: input.preconditions ?? null,
        testData: input.testData ?? null,
        expectedResult: input.expectedResult,
        priority: input.priority,
        testType: input.testType ?? null,
        status: input.status ?? "DRAFT",
        testResult: "NOT_RUN",
        createdById: actorId,
        updatedById: actorId,
      },
    });

    await tx.testStep.createMany({
      data: input.steps.map((step, index) => ({
        testCaseId: created.id,
        sequence: index + 1,
        step: step.step,
        expectedResult: step.expectedResult,
      })),
    });

    return created;
  });

  await logTestCaseEvent("create", testCase, projectId, actorId, { newValue: testCase });

  return testCase;
}

export async function listTestCasesForTestGroup(testGroupId: string) {
  return prisma.testCase.findMany({
    where: { testGroupId, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

/** Full detail (steps, attachments) plus a synthesized `projectId` for RBAC checks. */
export async function getTestCaseWithProjectId(id: string) {
  const testCase = await prisma.testCase.findUnique({
    where: { id },
    include: {
      steps: { orderBy: { sequence: "asc" } },
      attachments: true,
      testGroup: { include: { scenario: { select: { projectId: true } } } },
    },
  });
  if (!testCase) {
    return null;
  }
  return { ...testCase, projectId: testCase.testGroup.scenario.projectId };
}

/** Full-field edit for ADMIN/QA_LEAD, including replacing the Test Step list when `steps` is provided. */
export async function updateTestCase(
  id: string,
  input: TestCaseInput,
  actorId: string,
) {
  validateTestCaseInput(input);

  const before = await getTestCaseWithProjectId(id);
  if (!before) {
    throw new Error("Test Case not found");
  }

  const after = await prisma.$transaction(async (tx) => {
    const updated = await tx.testCase.update({
      where: { id },
      data: {
        name: input.name,
        condition: input.condition ?? null,
        preconditions: input.preconditions ?? null,
        testData: input.testData ?? null,
        expectedResult: input.expectedResult,
        priority: input.priority,
        testType: input.testType ?? null,
        status: input.status ?? before.status,
        updatedById: actorId,
      },
    });

    await tx.testStep.deleteMany({ where: { testCaseId: id } });
    await tx.testStep.createMany({
      data: input.steps.map((step, index) => ({
        testCaseId: id,
        sequence: index + 1,
        step: step.step,
        expectedResult: step.expectedResult,
      })),
    });

    return updated;
  });

  await logTestCaseEvent("update", after, before.projectId, actorId, {
    oldValue: before,
    newValue: after,
  });

  return after;
}

/** The only fields a TESTER may ever change via the main PATCH endpoint. */
export const TESTER_EDITABLE_FIELDS = ["testResult", "notes"] as const;

/** Tester-path edit: only testResult/notes, both optional (partial update). */
export async function updateTestResultAndNotes(
  id: string,
  input: { testResult?: TestResult; notes?: string | null },
  actorId: string,
) {
  const before = await getTestCaseWithProjectId(id);
  if (!before) {
    throw new Error("Test Case not found");
  }

  const after = await prisma.testCase.update({
    where: { id },
    data: {
      ...(input.testResult !== undefined ? { testResult: input.testResult } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      updatedById: actorId,
    },
  });

  await logTestCaseEvent("update-result", after, before.projectId, actorId, {
    oldValue: before,
    newValue: after,
  });

  return after;
}

export async function updateAssignee(id: string, assigneeId: string | null, actorId: string) {
  const before = await getTestCaseWithProjectId(id);
  if (!before) {
    throw new Error("Test Case not found");
  }

  const after = await prisma.testCase.update({
    where: { id },
    data: { assigneeId, updatedById: actorId },
  });

  await logTestCaseEvent("update-assignee", after, before.projectId, actorId, {
    oldValue: before,
    newValue: after,
  });

  return after;
}

export async function duplicateTestCase(id: string, actorId: string) {
  const source = await getTestCaseWithProjectId(id);
  if (!source) {
    throw new Error("Test Case not found");
  }

  const copy = await prisma.$transaction(async (tx) => {
    const created = await tx.testCase.create({
      data: {
        testGroupId: source.testGroupId,
        name: source.name,
        condition: source.condition,
        preconditions: source.preconditions,
        testData: source.testData,
        expectedResult: source.expectedResult,
        priority: source.priority,
        testType: source.testType,
        status: source.status,
        testResult: "NOT_RUN",
        createdById: actorId,
        updatedById: actorId,
      },
    });

    await tx.testStep.createMany({
      data: source.steps.map((step) => ({
        testCaseId: created.id,
        sequence: step.sequence,
        step: step.step,
        expectedResult: step.expectedResult,
      })),
    });

    return created;
  });

  await logTestCaseEvent("duplicate", copy, source.projectId, actorId, { newValue: copy });

  return copy;
}

export async function archiveTestCase(id: string, actorId: string) {
  return setTestCaseDeletedAt(id, actorId, "archive", new Date());
}

export async function restoreTestCase(id: string, actorId: string) {
  return setTestCaseDeletedAt(id, actorId, "restore", null);
}

export async function deleteTestCase(id: string, actorId: string, confirm: boolean) {
  if (!confirm) {
    throw new ConfirmRequiredError();
  }
  return setTestCaseDeletedAt(id, actorId, "delete", new Date());
}
