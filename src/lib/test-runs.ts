import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { notifyProject } from "@/lib/notifications";
import { paginate, type PageFilters } from "@/lib/pagination";
import { deleteFile } from "@/lib/storage";
import type { Prisma, TestResult } from "@/generated/prisma/client";

export class TestRunValidationError extends Error {}

export type TestRunInput = {
  name: string;
  /** Six sprints to a phase here. Free text rather than a table: a phase has
   *  no dates and no status of its own — only the rounds inside it do. */
  phase?: string | null;
  startsOn?: Date | null;
  endsOn?: Date | null;
};

/** Every phase this project has used, for the pickers to offer. */
export async function listPhasesForProject(projectId: string) {
  const rows = await prisma.testRun.findMany({
    where: { projectId, deletedAt: null, phase: { not: null } },
    select: { phase: true },
    distinct: ["phase"],
    orderBy: { phase: "asc" },
  });
  return rows.map((row) => row.phase as string);
}

/**
 * Matches an existing phase case-insensitively and answers with the spelling
 * already in use, so "phase 2" typed against a project that says "Phase 2"
 * joins that phase instead of starting a second one beside it. The same guard
 * `Requirement.feature` has, for the same reason.
 */
async function normalizePhase(projectId: string, raw: string | null | undefined) {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return null;
  }
  const known = await listPhasesForProject(projectId);
  return known.find((value) => value.toLowerCase() === trimmed.toLowerCase()) ?? trimmed;
}

function validate(input: TestRunInput) {
  if (!input.name?.trim()) {
    throw new TestRunValidationError("Run name is required");
  }
  if (input.startsOn && input.endsOn && input.startsOn > input.endsOn) {
    throw new TestRunValidationError("The end date cannot be before the start date");
  }
}

/** Live Test Cases only, and only where the whole chain above them is live —
 *  an archived Scenario's cases are not work anyone is being asked to do. */
const LIVE_CASE = {
  deletedAt: null,
  testGroup: { deletedAt: null, scenario: { deletedAt: null } },
} as const;

const RUN_WITH_PROGRESS = {
  _count: { select: { cases: true } },
  createdBy: { select: { id: true, name: true } },
} as const;

export type TestRunFilters = {
  search?: string;
  status?: "OPEN" | "CLOSED";
  archived?: boolean;
  overdue?: boolean;
};

/** Same reasoning as `projectListWhere`'s `AND` array: `status` and
 *  `overdue` can each want to constrain `status` (an explicit filter, and
 *  overdue's own "must still be OPEN"), and spreading both into one object
 *  let whichever came last silently win — dropping the overdue exclusion
 *  whenever an explicit status was also chosen, so `status=CLOSED&overdue=1`
 *  returned CLOSED runs despite `isTestRunOverdue` never considering a
 *  CLOSED run overdue. */
function runWhere(projectId: string, filters: TestRunFilters) {
  return {
    projectId,
    deletedAt: filters.archived ? { not: null } : null,
    AND: [
      ...(filters.status ? [{ status: filters.status }] : []),
      ...(filters.overdue
        ? [{ endsOn: { lt: new Date() } }, { status: "OPEN" as const }]
        : []),
      ...(filters.search
        ? [{ name: { contains: filters.search, mode: "insensitive" as const } }]
        : []),
    ],
  };
}

export async function listRunsForProjectPage(
  projectId: string,
  filters: TestRunFilters & PageFilters = {},
) {
  const where = runWhere(projectId, filters);
  const page = await paginate(
    filters,
    () => prisma.testRun.count({ where }),
    ({ skip, take }) =>
      prisma.testRun.findMany({
        where,
        include: RUN_WITH_PROGRESS,
        orderBy: [{ createdAt: "desc" }],
        skip,
        take,
      }),
  );

  // How far each round has got, counted in one grouped query rather than one
  // per row — a project with many rounds would otherwise be N round trips.
  const runIds = page.items.map((run) => run.id);
  const ranRows = await prisma.testRunCase.groupBy({
    by: ["testRunId"],
    where: { testRunId: { in: runIds }, testResult: { not: "NOT_RUN" } },
    _count: { _all: true },
  });
  const ranByRun = new Map(ranRows.map((row) => [row.testRunId, row._count._all]));

  return {
    ...page,
    items: page.items.map((run) => ({ ...run, ranCount: ranByRun.get(run.id) ?? 0 })),
  };
}

export async function getRunById(id: string) {
  return prisma.testRun.findUnique({ where: { id }, include: RUN_WITH_PROGRESS });
}

/** Plus a synthesized `projectId`, the same shape `getTestCaseWithProjectId`
 *  returns — this is what the run-case attachment routes check role against. */
export async function getRunCaseWithProjectId(id: string) {
  const runCase = await prisma.testRunCase.findUnique({
    where: { id },
    include: { testRun: { select: { projectId: true } } },
  });
  if (!runCase) {
    return null;
  }
  return { ...runCase, projectId: runCase.testRun.projectId };
}

/** Every case in a round, with the chain above it so the list can group by
 *  Scenario and Test Group instead of repeating four levels on every row. */
export async function listCasesInRun(testRunId: string) {
  return prisma.testRunCase.findMany({
    where: { testRunId },
    include: {
      ranBy: { select: { id: true, name: true } },
      attachments: { orderBy: { uploadedAt: "desc" } },
      testCase: {
        select: {
          id: true,
          name: true,
          priority: true,
          deletedAt: true,
          condition: true,
          preconditions: true,
          testData: true,
          expectedResult: true,
          steps: { orderBy: { sequence: "asc" } },
          testGroup: {
            select: {
              id: true,
              name: true,
              sequence: true,
              scenario: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
    orderBy: [{ createdAt: "asc" }],
  });
}

/** The same shape as `listCasesInRun`, one page at a time — a round with
 *  thousands of cases rendered every one of them into the DOM at once
 *  otherwise, on a page opened routinely rather than occasionally like the
 *  export. `ranCount` is counted separately rather than derived from the
 *  page's own rows, since "N of M run" has to mean the whole round, not just
 *  whichever page happens to be showing. */
export async function listCasesInRunPage(testRunId: string, filters: PageFilters = {}) {
  const where = { testRunId };
  const [page, ranCount] = await Promise.all([
    paginate(
      filters,
      () => prisma.testRunCase.count({ where }),
      ({ skip, take }) =>
        prisma.testRunCase.findMany({
          where,
          include: {
            ranBy: { select: { id: true, name: true } },
            attachments: { orderBy: { uploadedAt: "desc" } },
            testCase: {
              select: {
                id: true,
                name: true,
                priority: true,
                deletedAt: true,
                condition: true,
                preconditions: true,
                testData: true,
                expectedResult: true,
                steps: { orderBy: { sequence: "asc" } },
                testGroup: {
                  select: {
                    id: true,
                    name: true,
                    sequence: true,
                    scenario: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
          orderBy: [{ createdAt: "asc" }],
          skip,
          take,
        }),
    ),
    prisma.testRunCase.count({ where: { testRunId, testResult: { not: "NOT_RUN" } } }),
  ]);
  return { ...page, ranCount };
}

/** Every case in a round with its full ancestor chain, for the results
 *  export — `listCasesInRun` stops at Scenario/Test Group because the page it
 *  serves groups by those; this needs Requirement and Module too. */
export async function listRunResultsForExport(testRunId: string) {
  return prisma.testRunCase.findMany({
    where: { testRunId },
    include: {
      ranBy: { select: { name: true } },
      testCase: {
        select: {
          name: true,
          priority: true,
          testGroup: {
            select: {
              name: true,
              scenario: {
                select: {
                  name: true,
                  requirement: {
                    select: { name: true, module: { select: { name: true } } },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: [{ createdAt: "asc" }],
  });
}

export async function createRun(projectId: string, input: TestRunInput, actorId: string) {
  validate(input);
  const name = input.name.trim();

  const clash = await prisma.testRun.findUnique({
    where: { projectId_name: { projectId, name } },
  });
  if (clash) {
    throw new TestRunValidationError(`"${name}" already exists in this project`);
  }

  const run = await prisma.testRun.create({
    data: {
      projectId,
      name,
      phase: await normalizePhase(projectId, input.phase),
      startsOn: input.startsOn ?? null,
      endsOn: input.endsOn ?? null,
      createdById: actorId,
    },
  });

  await writeAuditLog({
    entityType: "TestRun",
    entityId: run.id,
    action: "create",
    actorId,
    projectId,
    newValue: run,
  });

  return run;
}

export async function updateRun(id: string, input: TestRunInput, actorId: string) {
  validate(input);
  const before = await prisma.testRun.findUniqueOrThrow({ where: { id } });
  requireOpen(before.status);

  const run = await prisma.testRun.update({
    where: { id },
    data: {
      name: input.name.trim(),
      phase: await normalizePhase(before.projectId, input.phase),
      startsOn: input.startsOn ?? null,
      endsOn: input.endsOn ?? null,
    },
  });

  await writeAuditLog({
    entityType: "TestRun",
    entityId: id,
    action: "update",
    actorId,
    projectId: before.projectId,
    oldValue: before,
    newValue: run,
  });

  return run;
}

/**
 * A closed round is the record of what happened, so nothing in it may change.
 * Every write path calls this first — without it the history this feature
 * exists to keep would be editable after the fact.
 */
function requireOpen(status: "OPEN" | "CLOSED") {
  if (status === "CLOSED") {
    throw new TestRunValidationError("This run is closed. Reopen it to make changes.");
  }
}

/** Same guard, for `attachments.ts` — a round's evidence is part of its
 *  record too, so it stops changing the moment the round closes, exactly
 *  like the result it's attached to. */
export async function assertRunOpenForCase(runCaseId: string) {
  const runCase = await prisma.testRunCase.findUniqueOrThrow({
    where: { id: runCaseId },
    include: { testRun: { select: { status: true } } },
  });
  requireOpen(runCase.testRun.status);
}

export async function setRunStatus(id: string, status: "OPEN" | "CLOSED", actorId: string) {
  const before = await prisma.testRun.findUniqueOrThrow({ where: { id } });
  const run = await prisma.testRun.update({
    where: { id },
    data: { status, closedAt: status === "CLOSED" ? new Date() : null },
  });

  await writeAuditLog({
    entityType: "TestRun",
    entityId: id,
    action: status === "CLOSED" ? "close" : "reopen",
    actorId,
    projectId: before.projectId,
    oldValue: { status: before.status },
    newValue: { status },
  });

  if (status === "CLOSED") {
    const byResult = await prisma.testRunCase.groupBy({
      by: ["testResult"],
      where: { testRunId: id },
      _count: { _all: true },
    });
    const total = byResult.reduce((sum, row) => sum + row._count._all, 0);
    const passed = byResult.find((row) => row.testResult === "PASSED")?._count._all ?? 0;
    const percent = total > 0 ? Math.round((passed / total) * 100) : 0;

    await notifyProject({
      projectId: before.projectId,
      type: "TEST_RUN_CLOSED",
      title: `Test Run "${run.name}" closed`,
      body: `${passed} of ${total} test cases passed (${percent}%).`,
      link: `/projects/${before.projectId}/runs/${id}`,
      actorId,
      excludeUserId: actorId,
    });
  }

  return run;
}

export async function setRunDeletedAt(id: string, deletedAt: Date | null, actorId: string) {
  const before = await prisma.testRun.findUniqueOrThrow({ where: { id } });
  const run = await prisma.testRun.update({ where: { id }, data: { deletedAt } });

  await writeAuditLog({
    entityType: "TestRun",
    entityId: id,
    action: deletedAt ? "archive" : "restore",
    actorId,
    projectId: before.projectId,
  });

  return run;
}

export type RunCandidateFilters = {
  moduleId?: string;
  requirementId?: string;
  scenarioId?: string;
  testGroupId?: string;
  priority?: string;
  lastResult?: TestResult;
  search?: string;
};

/**
 * The Test Cases that could be added to a round: everything live in the
 * project that isn't in this round already. The chain above each one comes
 * back with it so the picker can group rather than repeat it per row.
 */
export async function listCandidateCases(
  projectId: string,
  testRunId: string,
  filters: RunCandidateFilters = {},
) {
  const where: Prisma.TestCaseWhereInput = {
    ...LIVE_CASE,
    testGroup: {
      deletedAt: null,
      ...(filters.testGroupId ? { id: filters.testGroupId } : {}),
      scenario: {
        deletedAt: null,
        projectId,
        ...(filters.scenarioId ? { id: filters.scenarioId } : {}),
        ...(filters.requirementId ? { requirementId: filters.requirementId } : {}),
        ...(filters.moduleId ? { requirement: { moduleId: filters.moduleId } } : {}),
      },
    },
    ...(filters.priority ? { priority: filters.priority as never } : {}),
    ...(filters.lastResult ? { testResult: filters.lastResult } : {}),
    ...(filters.search ? { name: { contains: filters.search, mode: "insensitive" } } : {}),
    runCases: { none: { testRunId } },
  };

  return prisma.testCase.findMany({
    where,
    select: {
      id: true,
      name: true,
      priority: true,
      testResult: true,
      testGroup: {
        select: {
          id: true,
          name: true,
          sequence: true,
          scenario: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ testGroup: { sequence: "asc" } }, { name: "asc" }],
  });
}

/**
 * Adds a batch in one insert. Picking a whole Module can mean well over a
 * hundred cases, and a row-at-a-time loop is what puts the CSV import over
 * the hosting time limit today — the same mistake is not worth repeating.
 */
export async function addCasesToRun(testRunId: string, testCaseIds: string[], actorId: string) {
  const run = await prisma.testRun.findUniqueOrThrow({ where: { id: testRunId } });
  requireOpen(run.status);

  if (testCaseIds.length === 0) {
    return { added: 0 };
  }

  // Only cases that really belong to this project and aren't in the round.
  const eligible = await prisma.testCase.findMany({
    where: {
      id: { in: testCaseIds },
      ...LIVE_CASE,
      testGroup: { deletedAt: null, scenario: { deletedAt: null, projectId: run.projectId } },
      runCases: { none: { testRunId } },
    },
    select: { id: true },
  });

  const result = await prisma.testRunCase.createMany({
    data: eligible.map((testCase) => ({ testRunId, testCaseId: testCase.id })),
  });

  await writeAuditLog({
    entityType: "TestRun",
    entityId: testRunId,
    action: "add-cases",
    actorId,
    projectId: run.projectId,
    newValue: { added: result.count },
  });

  return { added: result.count };
}

export async function removeCaseFromRun(testRunId: string, testCaseId: string, actorId: string) {
  const run = await prisma.testRun.findUniqueOrThrow({ where: { id: testRunId } });
  requireOpen(run.status);

  const runCase = await prisma.testRunCase.findUniqueOrThrow({
    where: { testRunId_testCaseId: { testRunId, testCaseId } },
  });
  // No `onDelete: Cascade` on Attachment.runCase — deleting a TestRunCase
  // that still has one attached would fail on the foreign key. Storage
  // objects are removed after the transaction commits, same reasoning as
  // `purgeTestCases`: an object store isn't part of it, and a failure there
  // must not undo a delete the database has already accepted.
  const attachments = await prisma.attachment.findMany({
    where: { runCaseId: runCase.id },
    select: { storageKey: true },
  });
  await prisma.$transaction([
    prisma.attachment.deleteMany({ where: { runCaseId: runCase.id } }),
    prisma.testRunCase.delete({ where: { id: runCase.id } }),
  ]);
  await Promise.all(attachments.map((attachment) => deleteFile(attachment.storageKey)));

  await writeAuditLog({
    entityType: "TestRun",
    entityId: testRunId,
    action: "remove-case",
    actorId,
    projectId: run.projectId,
    oldValue: { testCaseId },
  });
}

/**
 * The one place a result is written. It records the result against the round,
 * and mirrors it onto `TestCase.testResult` — which every list and the
 * Dashboard's default view read as "the latest result" — in the same
 * transaction, so the two can never disagree.
 *
 * "Latest" means *the newest round*, not the most recent keystroke. Before
 * this guard the mirror was last-write-wins, so recording into an older round
 * after a newer one had already reported stamped the older answer onto the
 * Test Case: four cases ended up showing Sprint 5's SKIPPED while Sprint 6 had
 * them as FAILED. Which round is newer is decided by `createdAt`, the same
 * order the Dashboard's round picker lists them in, and the only ordering
 * every round has — `startsOn` is optional and often unset.
 *
 * A round that merely holds the case does not hold the mirror: it has to have
 * recorded something. An archived round holds nothing at all.
 */
export async function setRunCaseResult(
  testRunId: string,
  testCaseId: string,
  input: { testResult: TestResult; notes?: string | null },
  actorId: string,
) {
  const run = await prisma.testRun.findUniqueOrThrow({ where: { id: testRunId } });
  requireOpen(run.status);

  const before = await prisma.testRunCase.findUniqueOrThrow({
    where: { testRunId_testCaseId: { testRunId, testCaseId } },
  });

  const newerRound = await prisma.testRunCase.findFirst({
    where: {
      testCaseId,
      testResult: { not: "NOT_RUN" },
      testRun: { deletedAt: null, createdAt: { gt: run.createdAt } },
    },
    select: { testRun: { select: { name: true } } },
    orderBy: { testRun: { createdAt: "desc" } },
  });

  const ran = input.testResult !== "NOT_RUN";

  const [runCase] = await prisma.$transaction([
    prisma.testRunCase.update({
      where: { testRunId_testCaseId: { testRunId, testCaseId } },
      data: {
        testResult: input.testResult,
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ranById: ran ? actorId : null,
        ranAt: ran ? new Date() : null,
      },
    }),
    // Skipped entirely when a newer round has spoken — including the notes,
    // which belong to the result they were written beside.
    ...(newerRound
      ? []
      : [
          prisma.testCase.update({
            where: { id: testCaseId },
            data: {
              testResult: input.testResult,
              ...(input.notes !== undefined ? { notes: input.notes } : {}),
              updatedById: actorId,
            },
          }),
        ]),
  ]);

  await writeAuditLog({
    entityType: "TestCase",
    entityId: testCaseId,
    action: "run-result",
    actorId,
    projectId: run.projectId,
    oldValue: { testRunId, testResult: before.testResult },
    newValue: {
      testRunId,
      testResult: input.testResult,
      // Recorded so the trail explains why the Test Case did not move.
      ...(newerRound ? { mirrorHeldBy: newerRound.testRun.name } : {}),
    },
  });

  if (input.testResult === "FAILED") {
    const testCase = await prisma.testCase.findUniqueOrThrow({
      where: { id: testCaseId },
      select: { name: true },
    });
    await notifyProject({
      projectId: run.projectId,
      type: "TEST_CASE_FAILED",
      title: "Test case failed in latest run",
      body: `"${testCase.name}" failed in ${run.name}.`,
      link: `/projects/${run.projectId}/runs/${testRunId}`,
      actorId,
      excludeUserId: actorId,
    });
  }

  return {
    ...runCase,
    /** The newer round whose result the Test Case keeps showing, if any. The
     *  caller tells the user, so recording into an older round doesn't read as
     *  a save that failed. */
    mirrorHeldBy: newerRound?.testRun.name ?? null,
  };
}
