import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { purgeTestCase } from "@/lib/hard-delete";
import { paginate, type PageFilters } from "@/lib/pagination";
import { writeAuditLog } from "@/lib/audit";
import { setDeletedAt, type SoftDeleteAction } from "@/lib/soft-delete";
import type { Priority, TestResult, TestType, WorkflowStatus } from "@/generated/prisma/client";

export class ValidationError extends Error {}
export class ConfirmRequiredError extends Error {
  constructor() {
    super("Deleting a Test Case requires confirm: true");
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
  /* A step's own expectedResult is optional, and was the one rule nothing
   * else in the app agreed with. The importer writes "" to every step but the
   * last (`stepRows`), because a sheet has one Expected Result describing the
   * outcome of the whole thing — so opening an imported Test Case and saving
   * it, changing nothing, was refused until someone typed a character into
   * each blank. The step editor never marked the field required either. Which
   * steps are worth an expectation of their own is the tester's call; the
   * Test Case still has a required overall Expected Result. */
  for (const step of input.steps) {
    if (!step.step) {
      throw new ValidationError("every Test Step needs its own step");
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

/**
 * The same list, plus each row's steps — needed by the list page to seed the
 * inline Edit form's TestStepEditor. Kept separate from
 * `listTestCasesForTestGroup` rather than added as a flag so
 * `/api/test-groups/[id]/test-cases`, which shares that function, can't grow a
 * `steps` array in its response as a side effect, and so the return type is
 * exact instead of a union the caller has to narrow.
 */
export async function listTestCasesWithStepsForTestGroup(testGroupId: string) {
  return prisma.testCase.findMany({
    where: { testGroupId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { steps: { orderBy: { sequence: "asc" } } },
  });
}

export type TestCaseFilters = {
  search?: string;
  priority?: Priority;
  testResult?: TestResult;
  status?: WorkflowStatus;
};

function testCaseListWhere(testGroupId: string, filters: TestCaseFilters) {
  return {
    testGroupId,
    deletedAt: null,
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.testResult ? { testResult: filters.testResult } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.search
      ? { name: { contains: filters.search, mode: "insensitive" as const } }
      : {}),
  };
}

/** One page of the list above, for the table's pager. */
export async function listTestCasesWithStepsForTestGroupPage(
  testGroupId: string,
  filters: TestCaseFilters & PageFilters = {},
) {
  const where = testCaseListWhere(testGroupId, filters);
  return paginate(
    filters,
    () => prisma.testCase.count({ where }),
    ({ skip, take }) =>
      prisma.testCase.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: { steps: { orderBy: { sequence: "asc" } } },
        skip,
        take,
      }),
  );
}

/**
 * Full detail (steps, attachments) plus a synthesized `projectId` for RBAC
 * checks. Wrapped in React's `cache` so `generateMetadata` and the page body,
 * which both need this record, share one query per request instead of two.
 */
export const getTestCaseWithProjectId = cache(async (id: string) => {
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
});

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

/** A lightweight partial update for the page's quick "record a result"
 * form — testResult/notes only, both optional — kept separate from the full
 * `updateTestCase` edit so logging a run doesn't require the whole form. */
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

/**
 * `ids` comes straight off a form's checkboxes — client-controlled input, not
 * something the caller's own role check can vouch for on its own. Narrowed to
 * this Test Group before archiving anything, the same defense
 * `addCasesToRun` uses for its own array-of-ids input: without it, a crafted
 * request could name a Test Case from a project the caller has no role on at
 * all, and it would be archived anyway.
 *
 * One-by-one rather than a single query: each archive writes its own audit
 * entry, and a row that's vanished or already archived out from under the
 * selection is skipped instead of failing the whole batch.
 */
export async function bulkArchiveTestCases(
  testGroupId: string,
  ids: string[],
  actorId: string,
) {
  if (ids.length === 0) {
    return 0;
  }
  const eligible = await prisma.testCase.findMany({
    where: { id: { in: ids }, testGroupId, deletedAt: null },
    select: { id: true },
  });

  let archived = 0;
  for (const testCase of eligible) {
    try {
      await archiveTestCase(testCase.id, actorId);
      archived++;
    } catch {
      continue;
    }
  }
  return archived;
}

export async function restoreTestCase(id: string, actorId: string) {
  return setTestCaseDeletedAt(id, actorId, "restore", null);
}

export async function deleteTestCase(id: string, actorId: string, confirm: boolean) {
  if (!confirm) {
    throw new ConfirmRequiredError();
  }
  const before = await getTestCaseWithProjectId(id);
  if (!before) {
    throw new ConfirmRequiredError();
  }

  // Really gone, with its steps, its attachments and its result in every round
  // it was ever part of. The audit entry is written first: it is the only
  // record that will be left.
  await writeAuditLog({
    entityType: "TestCase",
    entityId: id,
    action: "delete",
    actorId,
    projectId: before.projectId,
    oldValue: before,
  });
  const counts = await purgeTestCase(id);

  return { ...before, purged: counts };
}

/** A Test Case is a leaf: no descendants, so no descendant-count retrofit is needed on archive/delete. */
export async function moveTestCase(id: string, targetTestGroupId: string, actorId: string) {
  const before = await getTestCaseWithProjectId(id);
  if (!before) {
    throw new Error("Test Case not found");
  }

  const targetProjectId = await resolveProjectIdForTestGroup(targetTestGroupId);

  const testCase = await prisma.testCase.update({
    where: { id },
    data: { testGroupId: targetTestGroupId, updatedById: actorId },
  });

  await logTestCaseEvent("move", testCase, targetProjectId, actorId, {
    oldValue: { testGroupId: before.testGroupId },
    newValue: { testGroupId: targetTestGroupId },
  });

  return testCase;
}
