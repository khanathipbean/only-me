import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { setDeletedAt, type SoftDeleteAction } from "@/lib/soft-delete";
import { paginate, type PageFilters } from "@/lib/pagination";
import { planResults } from "@/lib/latest-results";
import type { Prisma, TestPlanStatus, TestResult } from "@/generated/prisma/client";

/**
 * A Test Plan is one phase of testing with a record of its own: what it is
 * for, who owns it, when it runs, and which Test Cases are in its scope.
 *
 * It records no result. Everything it says about passing and failing is read
 * from the `TestRun`s linked to it, through the same resolver the Dashboard
 * uses for a phase — so a plan and the rounds under it can never disagree.
 */

export class TestPlanValidationError extends Error {}

export const TEST_PLAN_STATUSES: TestPlanStatus[] = [
  "DRAFT",
  "IN_PROGRESS",
  "COMPLETED",
  "ON_HOLD",
];

export type TestPlanInput = {
  name: string;
  phase: string;
  objective: string;
  description?: string | null;
  environment?: string | null;
  build?: string | null;
  startsOn?: Date | null;
  endsOn?: Date | null;
  ownerId: string;
  status?: TestPlanStatus;
};

function trimmed(value: string | null | undefined) {
  const text = (value ?? "").trim();
  return text.length === 0 ? null : text;
}

async function validate(projectId: string, input: TestPlanInput, excludeId?: string) {
  const name = trimmed(input.name);
  const phase = trimmed(input.phase);
  const objective = trimmed(input.objective);

  if (!name) {
    throw new TestPlanValidationError("Plan name is required");
  }
  if (!phase) {
    throw new TestPlanValidationError("Phase is required");
  }
  if (!objective) {
    throw new TestPlanValidationError("Objective is required");
  }
  if (!input.ownerId) {
    throw new TestPlanValidationError("Owner is required");
  }
  /* A plan a reader cannot tell apart from another is a plan they will link
   * the wrong round to. The same rule a round already follows. */
  const clash = await prisma.testPlan.findFirst({
    where: { projectId, name, deletedAt: null, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    select: { id: true },
  });
  if (clash) {
    throw new TestPlanValidationError(`A plan named "${name}" already exists in this project`);
  }
  /* Dates are both optional and often filled in later, so only the pair
   * being wrong is worth refusing. */
  if (input.startsOn && input.endsOn && input.endsOn < input.startsOn) {
    throw new TestPlanValidationError("The end date cannot be before the start date");
  }
  /* The owner has to be on the project: a plan is work handed to somebody,
   * and handing it to an account that cannot open the project is the same
   * mistake assigning a case to a stranger would be. */
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: input.ownerId } },
    select: { userId: true },
  });
  if (!member) {
    throw new TestPlanValidationError("The owner must be a member of this project");
  }

  return {
    name,
    phase,
    objective,
    description: trimmed(input.description),
    environment: trimmed(input.environment),
    build: trimmed(input.build),
    startsOn: input.startsOn ?? null,
    endsOn: input.endsOn ?? null,
    ownerId: input.ownerId,
    status: input.status ?? "DRAFT",
  };
}

export async function createTestPlan(projectId: string, input: TestPlanInput, actorId: string) {
  const data = await validate(projectId, input);

  const plan = await prisma.testPlan.create({
    data: { ...data, projectId, createdById: actorId },
  });

  await writeAuditLog({
    entityType: "TestPlan",
    entityId: plan.id,
    action: "create",
    actorId,
    projectId,
    newValue: { name: plan.name, phase: plan.phase, status: plan.status },
  });

  return plan;
}

export async function updateTestPlan(id: string, input: TestPlanInput, actorId: string) {
  const before = await prisma.testPlan.findUniqueOrThrow({ where: { id } });
  const data = await validate(before.projectId, input, id);

  if (data.status === "COMPLETED" && before.status !== "COMPLETED") {
    await assertCompletable(id);
  }

  const plan = await prisma.testPlan.update({ where: { id }, data });

  await writeAuditLog({
    entityType: "TestPlan",
    entityId: id,
    action: "update",
    actorId,
    projectId: before.projectId,
    oldValue: { name: before.name, phase: before.phase, status: before.status },
    newValue: { name: plan.name, phase: plan.phase, status: plan.status },
  });

  /* The round takes the plan's phase, which is what keeps the two from ever
   * naming different ones. See `linkRunToPlan`. */
  if (plan.phase !== before.phase) {
    await prisma.testRun.updateMany({ where: { testPlanId: id }, data: { phase: plan.phase } });
  }

  return plan;
}

/**
 * Completed is the one state the rounds can contradict, so it is the one the
 * app checks: a plan is finished when every case in its scope has passed.
 * The others are a person's word about their own intentions and are taken as
 * given.
 */
export async function assertCompletable(id: string) {
  const outstanding = await listOutstandingCases(id);
  if (outstanding.length > 0) {
    throw new TestPlanValidationError(
      `${outstanding.length} case${outstanding.length === 1 ? "" : "s"} in this plan ` +
        "have not passed yet",
    );
  }
}

/** The cases in scope that have not passed, which is what a refusal has to
 *  be able to name. */
export async function listOutstandingCases(id: string) {
  const [scope, results] = await Promise.all([readScope(id), planResults(id)]);
  return scope.filter((row) => results.get(row.testCaseId) !== "PASSED");
}

async function readScope(id: string) {
  return prisma.testPlanCase.findMany({
    where: { testPlanId: id },
    select: {
      testCaseId: true,
      testCase: {
        select: {
          id: true,
          name: true,
          testGroup: {
            select: {
              id: true,
              name: true,
              scenario: {
                select: {
                  id: true,
                  name: true,
                  requirement: {
                    select: { id: true, code: true, name: true, module: { select: { id: true, name: true } } },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { testCase: { name: "asc" } },
  });
}

async function setTestPlanDeletedAt(
  id: string,
  deletedAt: Date | null,
  actorId: string,
  action: SoftDeleteAction,
) {
  const before = await prisma.testPlan.findUniqueOrThrow({ where: { id } });
  return setDeletedAt({
    entityType: "TestPlan",
    actorId,
    action,
    deletedAt,
    projectId: before.projectId,
    update: (at) => prisma.testPlan.update({ where: { id }, data: { deletedAt: at } }),
  });
}

export async function archiveTestPlan(id: string, actorId: string) {
  return setTestPlanDeletedAt(id, new Date(), actorId, "archive");
}

export async function restoreTestPlan(id: string, actorId: string) {
  return setTestPlanDeletedAt(id, null, actorId, "restore");
}

/* ---- the scope ------------------------------------------------------- */

/**
 * Adds cases to a plan's scope, in one insert.
 *
 * `skipDuplicates` is what makes picking a Module and one of its cases the
 * same as picking the Module: the pair is unique, so a case already in scope
 * is simply not added again. Picking a parent is expanded by the caller,
 * which is the only place that knows what the reader ticked.
 *
 * One insert rather than a loop, for the reason `addCasesToRun` carries: a
 * Module can hold well over a hundred cases, and a row at a time is what put
 * the CSV import over the hosting time limit.
 */
export async function addCasesToPlan(testPlanId: string, testCaseIds: string[], actorId: string) {
  if (testCaseIds.length === 0) {
    return { added: 0 };
  }
  const plan = await prisma.testPlan.findUniqueOrThrow({ where: { id: testPlanId } });

  /* Only live cases that really belong to this project: the ids arrive from
   * a form, and a form is whatever the request says it is. */
  const allowed = await prisma.testCase.findMany({
    where: {
      id: { in: testCaseIds },
      deletedAt: null,
      testGroup: { deletedAt: null, scenario: { deletedAt: null, projectId: plan.projectId } },
    },
    select: { id: true },
  });

  const result = await prisma.testPlanCase.createMany({
    data: allowed.map((testCase) => ({ testPlanId, testCaseId: testCase.id })),
    skipDuplicates: true,
  });

  if (result.count > 0) {
    await writeAuditLog({
      entityType: "TestPlan",
      entityId: testPlanId,
      action: "update",
      actorId,
      projectId: plan.projectId,
      newValue: { scopeAdded: result.count },
    });
  }

  return { added: result.count };
}

export async function removeCasesFromPlan(
  testPlanId: string,
  testCaseIds: string[],
  actorId: string,
) {
  if (testCaseIds.length === 0) {
    return { removed: 0 };
  }
  const plan = await prisma.testPlan.findUniqueOrThrow({ where: { id: testPlanId } });

  const result = await prisma.testPlanCase.deleteMany({
    where: { testPlanId, testCaseId: { in: testCaseIds } },
  });

  if (result.count > 0) {
    await writeAuditLog({
      entityType: "TestPlan",
      entityId: testPlanId,
      action: "update",
      actorId,
      projectId: plan.projectId,
      /* Taking a case out of a plan removes it from the plan's scope and
       * from nothing else: the case, and every result any round recorded
       * against it, are untouched. */
      newValue: { scopeRemoved: result.count },
    });
  }

  return { removed: result.count };
}

/**
 * The cases that have appeared under the plan's scope since it was drawn up.
 *
 * Scope is a snapshot, so these do not join on their own — the plan's page
 * offers them. A denominator that moves while nobody is looking makes every
 * figure above it unreadable.
 *
 * `sources` is what the reader ticked: module ids, requirement ids, or
 * both.
 */
export async function listNewCasesForPlan(
  testPlanId: string,
  sources: { moduleIds?: string[]; requirementIds?: string[] },
) {
  const moduleIds = sources.moduleIds ?? [];
  const requirementIds = sources.requirementIds ?? [];
  if (moduleIds.length === 0 && requirementIds.length === 0) {
    return [];
  }
  const plan = await prisma.testPlan.findUniqueOrThrow({ where: { id: testPlanId } });

  return prisma.testCase.findMany({
    where: {
      deletedAt: null,
      testGroup: {
        deletedAt: null,
        scenario: {
          deletedAt: null,
          projectId: plan.projectId,
          requirement: {
            OR: [
              ...(moduleIds.length > 0 ? [{ moduleId: { in: moduleIds } }] : []),
              ...(requirementIds.length > 0 ? [{ id: { in: requirementIds } }] : []),
            ],
          },
        },
      },
      planCases: { none: { testPlanId } },
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/**
 * The Test Cases that could still be added to a plan: everything live in the
 * project that is not in its scope already. The chain above each one comes
 * back with it, so the picker can group rather than repeat it per row.
 *
 * The same shape as `listCandidateCases` for a round, and fed to the same
 * `CasePicker` — one picker, so choosing cases reads the same wherever it
 * is done.
 */
export async function listCandidateCasesForPlan(
  testPlanId: string,
  filters: { moduleId?: string; requirementId?: string; search?: string } = {},
) {
  const plan = await prisma.testPlan.findUniqueOrThrow({ where: { id: testPlanId } });

  return prisma.testCase.findMany({
    where: {
      deletedAt: null,
      testGroup: {
        deletedAt: null,
        scenario: {
          deletedAt: null,
          projectId: plan.projectId,
          ...(filters.requirementId ? { requirementId: filters.requirementId } : {}),
          ...(filters.moduleId ? { requirement: { moduleId: filters.moduleId } } : {}),
        },
      },
      ...(filters.search
        ? { name: { contains: filters.search, mode: "insensitive" as const } }
        : {}),
      planCases: { none: { testPlanId } },
    },
    select: {
      id: true,
      name: true,
      priority: true,
      testResult: true,
      testGroup: {
        select: { name: true, sequence: true, scenario: { select: { name: true } } },
      },
    },
    orderBy: [{ testGroup: { sequence: "asc" } }, { name: "asc" }],
  });
}

/* ---- the rounds under a plan ------------------------------------------ */

/**
 * Links a round to a plan, or takes it out of one.
 *
 * Writes the link and the phase, and nothing else. Every result the round
 * recorded stays exactly as it was — joining a plan is a statement about
 * which phase the round belongs to, never about what happened in it.
 */
export async function linkRunToPlan(testRunId: string, testPlanId: string | null, actorId: string) {
  const run = await prisma.testRun.findUniqueOrThrow({ where: { id: testRunId } });
  const plan = testPlanId
    ? await prisma.testPlan.findUniqueOrThrow({ where: { id: testPlanId } })
    : null;

  if (plan && plan.projectId !== run.projectId) {
    throw new TestPlanValidationError("That plan belongs to a different project");
  }

  const updated = await prisma.testRun.update({
    where: { id: testRunId },
    /* The phase comes with the plan. Left to itself a round could sit under
     * a Sprint 12 plan while its own label said Sprint 11, and the Dashboard
     * filters by the label. */
    data: { testPlanId, ...(plan ? { phase: plan.phase } : {}) },
  });

  await writeAuditLog({
    entityType: "TestRun",
    entityId: testRunId,
    action: "update",
    actorId,
    projectId: run.projectId,
    oldValue: { testPlanId: run.testPlanId, phase: run.phase },
    newValue: { testPlanId: updated.testPlanId, phase: updated.phase },
  });

  return updated;
}

/* ---- reading ----------------------------------------------------------- */

export type TestPlanFilters = PageFilters & {
  search?: string;
  phase?: string;
  status?: TestPlanStatus;
  ownerId?: string;
};

export async function listTestPlansForProjectPage(projectId: string, filters: TestPlanFilters = {}) {
  const where: Prisma.TestPlanWhereInput = {
    projectId,
    deletedAt: null,
    ...(filters.search
      ? { name: { contains: filters.search, mode: "insensitive" as const } }
      : {}),
    ...(filters.phase ? { phase: filters.phase } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.ownerId ? { ownerId: filters.ownerId } : {}),
  };

  const { items, ...rest } = await paginate(
    filters,
    () => prisma.testPlan.count({ where }),
    ({ skip, take }) =>
      prisma.testPlan.findMany({
        where,
        include: {
          owner: { select: { id: true, name: true, email: true } },
          _count: { select: { cases: true, runs: true } },
        },
        orderBy: { updatedAt: "desc" },
        skip,
        take,
      }),
  );

  return { plans: items, ...rest };
}

export async function getTestPlanById(id: string) {
  return prisma.testPlan.findFirst({
    where: { id, deletedAt: null },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      project: { select: { id: true, code: true, name: true } },
    },
  });
}

/** Every phase a plan in this project has been filed under, for the picker. */
export async function listPlanPhases(projectId: string) {
  const rows = await prisma.testPlan.findMany({
    where: { projectId, deletedAt: null },
    select: { phase: true },
    distinct: ["phase"],
    orderBy: { phase: "asc" },
  });
  return rows.map((row) => row.phase);
}

export type TestPlanSummary = {
  cases: number;
  runs: number;
  passed: number;
  failed: number;
  notRun: number;
  /** Skipped and blocked: answered, but not a verdict either way. */
  other: number;
  /** Cases with any result recorded, over the scope. */
  progress: number;
};

/**
 * What the plan has come to, read from the rounds under it.
 *
 * A case in several rounds counts once, from the newest round that reported
 * on it — the rule `resolveLatestResults` holds for everybody. A case no
 * round has reached counts as Not Run, and a plan with no rounds at all is
 * therefore at zero rather than at nothing.
 */
export async function summariseTestPlan(id: string): Promise<TestPlanSummary> {
  const [scope, results, runs] = await Promise.all([
    prisma.testPlanCase.findMany({ where: { testPlanId: id }, select: { testCaseId: true } }),
    planResults(id),
    prisma.testRun.count({ where: { testPlanId: id, deletedAt: null } }),
  ]);

  let passed = 0;
  let failed = 0;
  let notRun = 0;
  let other = 0;
  for (const row of scope) {
    const result: TestResult = results.get(row.testCaseId) ?? "NOT_RUN";
    if (result === "PASSED") passed += 1;
    else if (result === "FAILED") failed += 1;
    else if (result === "NOT_RUN") notRun += 1;
    else other += 1;
  }

  const cases = scope.length;
  return {
    cases,
    runs,
    passed,
    failed,
    notRun,
    other,
    progress: cases === 0 ? 0 : ((cases - notRun) / cases) * 100,
  };
}

/** The plan's scope with each case's latest result, for the detail page. */
export async function listPlanCasesWithResults(id: string) {
  const [scope, results] = await Promise.all([readScope(id), planResults(id)]);
  return scope.map((row) => ({
    id: row.testCase.id,
    name: row.testCase.name,
    moduleId: row.testCase.testGroup.scenario.requirement.module.id,
    moduleName: row.testCase.testGroup.scenario.requirement.module.name,
    requirementId: row.testCase.testGroup.scenario.requirement.id,
    requirementCode: row.testCase.testGroup.scenario.requirement.code,
    requirementName: row.testCase.testGroup.scenario.requirement.name,
    scenarioId: row.testCase.testGroup.scenario.id,
    scenarioName: row.testCase.testGroup.scenario.name,
    testGroupId: row.testCase.testGroup.id,
    testGroupName: row.testCase.testGroup.name,
    result: results.get(row.testCaseId) ?? ("NOT_RUN" as TestResult),
  }));
}

/** The rounds under a plan, newest first, with how far each got. */
export async function listRunsForPlan(id: string) {
  const runs = await prisma.testRun.findMany({
    where: { testPlanId: id, deletedAt: null },
    select: { id: true, name: true, status: true, startsOn: true, endsOn: true },
    orderBy: { createdAt: "desc" },
  });

  if (runs.length === 0) {
    return [];
  }

  /* One grouped query for every round, rather than a pair per round. */
  const rows = await prisma.testRunCase.groupBy({
    by: ["testRunId", "testResult"],
    where: { testRunId: { in: runs.map((run) => run.id) } },
    _count: { _all: true },
  });

  return runs.map((run) => {
    const mine = rows.filter((row) => row.testRunId === run.id);
    const count = (result: TestResult) =>
      mine.find((row) => row.testResult === result)?._count._all ?? 0;
    const total = mine.reduce((sum, row) => sum + row._count._all, 0);
    return {
      ...run,
      total,
      recorded: total - count("NOT_RUN"),
      passed: count("PASSED"),
      failed: count("FAILED"),
    };
  });
}
