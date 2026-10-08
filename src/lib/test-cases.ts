import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { purgeTestCase } from "@/lib/hard-delete";
import { rollUpAfter, rollUpFrom, statusFromResult } from "@/lib/status-rollup";
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
  const result = await setDeletedAt({
    entityType: "TestCase",
    actorId,
    action,
    deletedAt,
    projectId: before.projectId,
    update: (deletedAt) =>
      prisma.testCase.update({ where: { id }, data: { deletedAt, updatedById: actorId } }),
  });

  /* Archiving changes the set the parent derives from as surely as editing a
   * status does — and settling a parent whose last stray child is obsolete is
   * exactly what this app asks people to do instead of typing over the
   * parent's status. */
  await rollUpAfter("testGroup", before.testGroupId);

  return result;
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

    /* Inside the caller's own transaction, so the case and everything its
     * status moves above it commit together. */
    await rollUpFrom(tx, "testGroup", testGroupId);

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

/**
 * Just the ids a filter matches, every page of them.
 *
 * For "select all N, not only the ten you can see". Read on the server from
 * the same `where` the list was drawn with, so a bulk action touches the set
 * the reader was looking at rather than whatever a browser that has seen one
 * page managed to collect.
 */
export async function listTestCaseIdsForTestGroup(
  testGroupId: string,
  filters: TestCaseFilters = {},
) {
  const rows = await prisma.testCase.findMany({
    where: testCaseListWhere(testGroupId, filters),
    select: { id: true },
  });
  return rows.map((row) => row.id);
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
        include: {
          steps: { orderBy: { sequence: "asc" } },
          /* How many rounds have held this case — not how many ran it. The
           * Test Result column already says NOT RUN for both "never in a
           * round" and "in rounds, skipped every time", and counting rounds
           * that recorded something would collapse them again. Counted here
           * so the two read side by side: NOT RUN with no rounds is a case
           * nothing has ever looked at; NOT RUN with two is one that was
           * scheduled twice and passed over.
           *
           * Live rounds only. An archived round keeps its TestRunCase rows,
           * and counting them would credit a case with coverage nobody can
           * open — the mistake the Dashboard made once. */
          _count: { select: { runCases: { where: { testRun: { deletedAt: null } } } } },
        },
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

    await rollUpFrom(tx, "testGroup", before.testGroupId);

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

  /* A result settles the status too, and the status then settles the three
   * levels above. Null for NOT_RUN, which leaves a case nobody has reached
   * with whatever status it was given. */
  const status = input.testResult !== undefined ? statusFromResult(input.testResult) : null;

  const after = await prisma.$transaction(async (tx) => {
    const updated = await tx.testCase.update({
      where: { id },
      data: {
        ...(input.testResult !== undefined ? { testResult: input.testResult } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(status ? { status } : {}),
        updatedById: actorId,
      },
    });

    /* The answer, kept. Without this the case's own column was simply
     * overwritten and the recording left no trace: the Dashboard showed the
     * failure, the Requirement went to In Progress because of it, and the
     * report that exists to name what is going wrong could not see it at
     * all. No round, because there is none — that is what the report draws
     * differently, not something it has to guess at.
     *
     * Only when a result was given. Editing a note on its own is not an
     * answer and should not add a round trip to the case's history. */
    if (input.testResult !== undefined) {
      await tx.testResultEvent.create({
        data: {
          testCase: { connect: { id } },
          testResult: input.testResult,
          notes: input.notes ?? null,
          recordedBy: { connect: { id: actorId } },
        },
      });
    }

    if (status) {
      await rollUpFrom(tx, "testGroup", updated.testGroupId);
    }
    return updated;
  });

  await logTestCaseEvent("update-result", after, before.projectId, actorId, {
    oldValue: before,
    newValue: after,
  });

  return after;
}

/**
 * Status alone, for the list's inline control.
 *
 * Separate from `updateTestCase` because that one validates and rewrites the
 * whole case, steps included: changing a status through it would mean
 * sending back every field the row does not have, and a field that arrived
 * empty would be written as empty.
 *
 * The roll-up runs, so the Test Group, Scenario and Requirement above settle
 * the same way they do after the full edit — that is the whole point of
 * the status being here rather than typed on the parent.
 */
export async function updateTestCaseStatus(id: string, status: WorkflowStatus, actorId: string) {
  const before = await getTestCaseWithProjectId(id);
  if (!before) {
    throw new Error("Test Case not found");
  }

  const after = await prisma.$transaction(async (tx) => {
    const updated = await tx.testCase.update({
      where: { id },
      data: { status, updatedById: actorId },
    });
    await rollUpFrom(tx, "testGroup", before.testGroupId);
    return updated;
  });

  await logTestCaseEvent("update", after, before.projectId, actorId, {
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

    await rollUpFrom(tx, "testGroup", source.testGroupId);

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
  await rollUpAfter("testGroup", before.testGroupId);

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

  /* Both ends. The Test Group it left has one fewer child and nothing else
   * will ever notice — this is the easiest of these to forget, and the one
   * that leaves a parent stuck at a status its children stopped saying. */
  await rollUpAfter("testGroup", before.testGroupId);
  if (targetTestGroupId !== before.testGroupId) {
    await rollUpAfter("testGroup", targetTestGroupId);
  }

  await logTestCaseEvent("move", testCase, targetProjectId, actorId, {
    oldValue: { testGroupId: before.testGroupId },
    newValue: { testGroupId: targetTestGroupId },
  });

  return testCase;
}
