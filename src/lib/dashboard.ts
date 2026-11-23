import { prisma } from "@/lib/prisma";
import {
  countCasesNeedingAttention,
  type AttentionPattern,
} from "@/lib/run-history";
import { PRIORITY_VALUES, TEST_RESULT_VALUES } from "@/lib/enums";
import type {
  Priority,
  TestResult,
  TestRunStatus,
  WorkflowStatus,
} from "@/generated/prisma/client";

/** An empty roll-up, which is also what a Requirement nothing tests holds. */
export function emptyResults(): NodeResults {
  return { total: 0, passed: 0, failed: 0, notRun: 0, other: 0, recorded: 0 };
}

/** Adds `from` into `into`, which is how every level above a Test Group gets
 *  its figures. */
function addResults(into: NodeResults, from: NodeResults): void {
  into.total += from.total;
  into.passed += from.passed;
  into.failed += from.failed;
  into.notRun += from.notRun;
  into.other += from.other;
  into.recorded += from.recorded;
}

/** One case's contribution, by the result that actually applies to it — the
 *  round's own where a round is chosen, which the caller has resolved. */
function countOne(into: NodeResults, result: TestResult): void {
  into.total += 1;
  if (result === "PASSED") {
    into.passed += 1;
  } else if (result === "FAILED") {
    into.failed += 1;
  } else if (result === "NOT_RUN") {
    into.notRun += 1;
  } else {
    into.other += 1;
  }
  if (result !== "NOT_RUN") {
    into.recorded += 1;
  }
}

/**
 * Whether anything on this dashboard narrows by the test cases themselves.
 *
 * It decides one thing: whether a Requirement with no test cases can be shown
 * at all. One with none cannot match a question about results, a round, a
 * priority or an assignee, so while such a filter is on it is not absent — it
 * is unanswerable, and the panel says that instead of printing a zero that
 * reads as good news.
 */
export function narrowsByCase(filters: DashboardFilters): boolean {
  return Boolean(
    filters.search ||
      filters.testResult ||
      filters.priority ||
      filters.status ||
      filters.assigneeId ||
      filters.testRunId ||
      filters.phase ||
      filters.scenarioId ||
      filters.testGroupId ||
      (filters.tags && filters.tags.length > 0),
  );
}

/** Pure: no divide-by-zero when a project has no Test Cases yet. */
export function calculateTestProgress(testCasesWithResult: number, totalTestCases: number): number {
  return totalTestCases === 0 ? 0 : (testCasesWithResult / totalTestCases) * 100;
}

export type DashboardFilters = {
  search?: string;
  moduleId?: string;
  /** A label inside a Module, not a level — see `Requirement.feature`. */
  feature?: string;
  requirementId?: string;
  scenarioId?: string;
  testGroupId?: string;
  testResult?: TestResult;
  priority?: Priority;
  status?: WorkflowStatus;
  assigneeId?: string;
  tags?: string[];
  /**
   * Narrows the whole dashboard to one round of testing.
   *
   * `TestCase.testResult` holds whatever the last round to touch that case
   * wrote there, so on its own it can't say how a given round is going — and
   * it counts cases no round has ever included. With a run chosen, only the
   * cases in it are counted and each one's result is that round's, read from
   * `TestRunCase`.
   */
  testRunId?: string;
  /**
   * Narrows the whole dashboard to one phase — six sprints, in this team's
   * process.
   *
   * Only the cases the phase's rounds scheduled are counted, and each one's
   * result is the phase's: the newest round inside it to actually report. A
   * case tested twice in the phase therefore reads as its latest result, the
   * same rule `TestCase.testResult` follows, rather than being counted twice.
   *
   * `testRunId` is the narrower choice of the two and wins when both are set.
   */
  phase?: string;
};

/**
 * What the Hierarchy panel's columns read off a node.
 *
 * Counted once, on the way up: every level is the sum of the level below it,
 * so a Module and the Requirements inside it can never disagree about how
 * many cases failed.
 *
 * `other` is skipped and blocked together. They have no column of their own —
 * the panel shows Passed, Failed and Not Run — so three figures out of five
 * results will not add up to `total`. Carrying the remainder lets the row say
 * so rather than leave a reader to find the gap and mistrust the rest.
 */
export type NodeResults = {
  total: number;
  passed: number;
  failed: number;
  notRun: number;
  other: number;
  /** Cases with any result recorded: the numerator of Execution %, and the
   *  same sum the Overview card calls Test Progress. */
  recorded: number;
};

export type DashboardTestCaseNode = {
  id: string;
  name: string;
  testResult: TestResult;
  priority: Priority;
  assigneeName: string | null;
};

export type DashboardTestGroupNode = {
  id: string;
  name: string;
  testCaseCount: number;
  results: NodeResults;
  testCases: DashboardTestCaseNode[];
};

export type DashboardScenarioNode = {
  id: string;
  name: string;
  /** Its ancestors, so the tree can link into the nested URL. */
  moduleId: string;
  requirementId: string;
  testCaseCount: number;
  results: NodeResults;
  testGroups: DashboardTestGroupNode[];
};

export type DashboardRequirementNode = {
  id: string;
  name: string;
  code: string | null;
  feature: string | null;
  testCaseCount: number;
  results: NodeResults;
  /** Still being written, so having no test case yet is not a debt. */
  isDraft: boolean;
  scenarios: DashboardScenarioNode[];
};

export type DashboardModuleNode = {
  id: string;
  name: string;
  testCaseCount: number;
  results: NodeResults;
  requirements: DashboardRequirementNode[];
};

/**
 * What the filter dropdowns offer. Deliberately *unfiltered*: taken from the
 * tree instead, choosing one Module would drop every other Module from its
 * own list and there would be no way to switch to a different one.
 */
export type DashboardFilterOptions = {
  modules: Array<{ id: string; name: string }>;
  features: Array<{ name: string; moduleId: string }>;
  requirements: Array<{ id: string; name: string; moduleId: string }>;
  scenarios: Array<{ id: string; name: string; requirementId: string }>;
  testGroups: Array<{ id: string; name: string; scenarioId: string }>;
  /** The rounds of testing this project has had, newest first. Narrowed to
   *  the chosen phase, so the picker offers what the panel shows. */
  testRuns: Array<{ id: string; name: string; status: TestRunStatus }>;
  /** Every phase the project's rounds have been filed under. */
  phases: string[];
};

/**
 * How far one round has got. Project-wide and unfiltered, like
 * `DashboardFilterOptions`: it exists to compare the rounds against each
 * other, so narrowing it to the current filter — or worse, to the currently
 * selected round — would leave nothing to compare.
 */
export type DashboardRunProgress = {
  id: string;
  name: string;
  status: TestRunStatus;
  /** Cases in the round. */
  total: number;
  /** Cases in it with a result recorded — anything but NOT_RUN. */
  recorded: number;
  byResult: Record<TestResult, number>;
};

/**
 * Work that has been scheduled into a round against work that has not.
 *
 * Answers what the Test Progress card cannot: that figure divides by every
 * case in the project, so a backlog nobody has planned to test yet drags it
 * down and makes the round in flight look stalled.
 */
export type DashboardCoverage = {
  inAnyRun: number;
  notInAnyRun: number;
};

export type ProjectDashboard = {
  hasAnyData: boolean;
  counts: {
    modules: number;
    requirements: number;
    scenarios: number;
    testGroups: number;
    testCases: number;
  };
  testCasesByResult: Record<TestResult, number>;
  testCasesByPriority: Record<Priority, number>;
  testCasesByAssignee: Array<{ assigneeId: string | null; assigneeName: string; count: number }>;
  testProgress: number;
  tree: DashboardModuleNode[];
  options: DashboardFilterOptions;
  runProgress: DashboardRunProgress[];
  coverage: DashboardCoverage;
  /** How many cases are in a shape worth doing something about, and which
   *  shapes. The result breakdown above says how many are failing now; this
   *  says how many keep failing, which is a different question and the one
   *  Problem Cases was built to answer. */
  attention: { total: number; byPattern: Record<AttentionPattern, number> };
  /**
   * How much of the project has a test case at all.
   *
   * Null while a filter about test cases is on. A requirement with none
   * cannot answer a question about results, rounds, priorities or people, so
   * the figure is unanswerable rather than zero — and a zero here would read
   * as there being nothing left to write.
   */
  requirementCoverage: {
    total: number;
    withCases: number;
    withoutCases: number;
    /** Of those, the ones still being drafted: not the same debt as a
     *  requirement signed off two sprints ago and never tested. */
    draftWithoutCases: number;
  } | null;
};

/** A live Test Case under a live Test Group under a live Scenario in this
 *  Project — the same chain the tree walks, so the coverage split and the
 *  Test Cases card can't be counting different populations. */
function liveCaseInProject(projectId: string) {
  return {
    deletedAt: null,
    testGroup: { deletedAt: null, scenario: { deletedAt: null, projectId } },
  };
}

/**
 * One result per Test Case across a phase's rounds.
 *
 * A phase is six sprints, so a case can be tested more than once inside it and
 * carry a different result each time. The rule here is the one
 * `TestCase.testResult` itself follows: the newest round to actually report
 * wins, and a case every round left NOT_RUN stays NOT_RUN. Rounds come oldest
 * first so each later report simply overwrites the one before it.
 *
 * The keys are the phase's membership as well as its results: a case with no
 * entry here was never scheduled into the phase at all.
 */
async function resolvePhaseResults(projectId: string, phase: string) {
  const rows = await prisma.testRunCase.findMany({
    // Live rounds only, for the reason the coverage count learned the hard
    // way: an archived round still owns its `TestRunCase` rows.
    where: { testRun: { projectId, deletedAt: null, phase } },
    select: { testCaseId: true, testResult: true },
    orderBy: { testRun: { createdAt: "asc" } },
  });

  const resolved = new Map<string, TestResult>();
  for (const row of rows) {
    if (!resolved.has(row.testCaseId) || row.testResult !== "NOT_RUN") {
      resolved.set(row.testCaseId, row.testResult);
    }
  }
  return resolved;
}

function zeroCountRecord<K extends string>(keys: K[]): Record<K, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
}

/**
 * Computes every dashboard number (totals, breakdowns, Test Progress) and the
 * hierarchy tree from one filtered query, so a filter change can never move
 * the counts and the tree out of sync with each other.
 */
export async function getProjectDashboard(
  projectId: string,
  filters: DashboardFilters = {},
): Promise<ProjectDashboard> {
  const hasAnyData =
    (await prisma.scenario.count({ where: { projectId, deletedAt: null } })) > 0;

  /* A round is the narrower of the two, so it wins when both are set. */
  const phaseResults =
    filters.phase && !filters.testRunId
      ? await resolvePhaseResults(projectId, filters.phase)
      : null;

  /* Membership and the result filter, both answered from the resolved map: a
   * case that passed in Sprint 4 and failed in Sprint 6 must not answer to
   * "Passed", which is exactly what a `runCases: { some: ... }` clause would
   * have let it do. */
  const phaseCaseIds = phaseResults
    ? Array.from(phaseResults)
        .filter(([, result]) => !filters.testResult || result === filters.testResult)
        .map(([testCaseId]) => testCaseId)
    : null;

  const testCaseWhere = {
    deletedAt: null,
    ...(filters.search
      ? { name: { contains: filters.search, mode: "insensitive" as const } }
      : {}),
    /* With a run chosen, membership *and* the result filter both go through
     * `runCases`: the result that matters is the one recorded in that round,
     * not the copy left on the Test Case by whichever round wrote last. A
     * phase answers both from `phaseCaseIds` for the same reason. Only with
     * neither does the mirrored result on the Test Case get the question. */
    ...(filters.testRunId
      ? {
          runCases: {
            some: {
              testRunId: filters.testRunId,
              ...(filters.testResult ? { testResult: filters.testResult } : {}),
            },
          },
        }
      : phaseCaseIds
        ? { id: { in: phaseCaseIds } }
        : filters.testResult
          ? { testResult: filters.testResult }
          : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.assigneeId ? { assigneeId: filters.assigneeId } : {}),
  };

  /* One query for the chosen round's results, so the loop below can read each
   * case's result for that round instead of the mirrored one. A phase brings
   * its own map, already resolved across its rounds. */
  const runResults = filters.testRunId
    ? new Map(
        (
          await prisma.testRunCase.findMany({
            where: { testRunId: filters.testRunId },
            select: { testCaseId: true, testResult: true },
          })
        ).map((runCase) => [runCase.testCaseId, runCase.testResult]),
      )
    : phaseResults;

  const testGroupWhere = {
    deletedAt: null,
    ...(filters.testGroupId ? { id: filters.testGroupId } : {}),
  };

  const scenarios = await prisma.scenario.findMany({
    where: {
      projectId,
      deletedAt: null,
      ...(filters.scenarioId ? { id: filters.scenarioId } : {}),
      ...(filters.requirementId ? { requirementId: filters.requirementId } : {}),
      ...(filters.moduleId || filters.feature
        ? {
            requirement: {
              ...(filters.moduleId ? { moduleId: filters.moduleId } : {}),
              ...(filters.feature ? { feature: filters.feature } : {}),
            },
          }
        : {}),
      ...(filters.tags && filters.tags.length > 0 ? { tags: { hasSome: filters.tags } } : {}),
      testGroups: { some: { ...testGroupWhere, testCases: { some: testCaseWhere } } },
    },
    include: {
      requirement: {
        select: {
          id: true,
          name: true,
          code: true,
          feature: true,
          status: true,
          moduleId: true,
          module: { select: { id: true, name: true, sequence: true } },
        },
      },
      testGroups: {
        where: { ...testGroupWhere, testCases: { some: testCaseWhere } },
        orderBy: { sequence: "asc" },
        include: {
          testCases: {
            where: testCaseWhere,
            include: { assignee: { select: { id: true, name: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const testCasesByResult = zeroCountRecord(TEST_RESULT_VALUES);
  const testCasesByPriority = zeroCountRecord(PRIORITY_VALUES);
  const byAssignee = new Map<string, { assigneeId: string | null; assigneeName: string; count: number }>();

  let totalTestCases = 0;
  let testCasesWithResult = 0;

  const scenarioNodes: DashboardScenarioNode[] = scenarios.map((scenario) => ({
    id: scenario.id,
    name: scenario.name,
    moduleId: scenario.requirement.moduleId,
    requirementId: scenario.requirementId,
    testCaseCount: scenario.testGroups.reduce((sum, group) => sum + group.testCases.length, 0),
    /* Filled from the groups once they are built, just below. */
    results: emptyResults(),
    testGroups: scenario.testGroups.map((group) => ({
      id: group.id,
      name: group.name,
      testCaseCount: group.testCases.length,
      results: emptyResults(),
      testCases: group.testCases.map((testCase) => {
        // The round's own result when a round is chosen. Read once here and
        // used for the breakdown, the progress and the tree node alike, so
        // the cards and the tree can never tell different stories.
        const testResult = runResults?.get(testCase.id) ?? testCase.testResult;

        totalTestCases += 1;
        testCasesByResult[testResult] += 1;
        testCasesByPriority[testCase.priority] += 1;
        if (testResult !== "NOT_RUN") {
          testCasesWithResult += 1;
        }

        const assigneeKey = testCase.assigneeId ?? "__unassigned__";
        const existing = byAssignee.get(assigneeKey);
        if (existing) {
          existing.count += 1;
        } else {
          byAssignee.set(assigneeKey, {
            assigneeId: testCase.assigneeId,
            assigneeName: testCase.assignee?.name ?? "Unassigned",
            count: 1,
          });
        }

        return {
          id: testCase.id,
          name: testCase.name,
          testResult,
          priority: testCase.priority,
          assigneeName: testCase.assignee?.name ?? null,
        };
      }),
    })),
  }));

  /* Rolled up after the nodes are built rather than inside the map above:
   * a node cannot count into itself while it is still being made, and one
   * more pass over cases already in hand costs nothing. */
  scenarioNodes.forEach((scenario) => {
    scenario.testGroups.forEach((group) => {
      group.testCases.forEach((testCase) => countOne(group.results, testCase.testResult));
      addResults(scenario.results, group.results);
    });
  });

  /* Grouped here rather than by querying Modules downward: the filters all
   * bite at Test Case level, and only a Scenario that survived them should
   * bring its Module and Requirement into the tree. Starting from Modules
   * would list the ones a filter emptied. */
  const moduleNodes = new Map<string, DashboardModuleNode>();
  const requirementNodes = new Map<string, DashboardRequirementNode>();

  scenarios.forEach((scenario, index) => {
    const node = scenarioNodes[index];
    const { module: scenarioModule, ...requirement } = scenario.requirement;

    let moduleNode = moduleNodes.get(scenarioModule.id);
    if (!moduleNode) {
      moduleNode = {
        id: scenarioModule.id,
        name: scenarioModule.name,
        testCaseCount: 0,
        results: emptyResults(),
        requirements: [],
      };
      moduleNodes.set(scenarioModule.id, moduleNode);
    }

    let requirementNode = requirementNodes.get(requirement.id);
    if (!requirementNode) {
      requirementNode = {
        id: requirement.id,
        name: requirement.name,
        code: requirement.code,
        feature: requirement.feature,
        testCaseCount: 0,
        results: emptyResults(),
        isDraft: requirement.status === "DRAFT",
        scenarios: [],
      };
      requirementNodes.set(requirement.id, requirementNode);
      moduleNode.requirements.push(requirementNode);
    }

    requirementNode.scenarios.push(node);
    requirementNode.testCaseCount += node.testCaseCount;
    moduleNode.testCaseCount += node.testCaseCount;
    addResults(requirementNode.results, node.results);
    addResults(moduleNode.results, node.results);
  });

  const tree = Array.from(moduleNodes.values());

  const [
    moduleOptions,
    requirementOptions,
    featureRows,
    scenarioOptions,
    testGroupOptions,
    testRunOptions,
    phaseRows,
    runResultRows,
    inAnyRun,
    notInAnyRun,
    attention,
    untestedRequirements,
  ] = await Promise.all([
      prisma.module.findMany({
        where: { projectId, deletedAt: null },
        select: { id: true, name: true },
        orderBy: [{ sequence: "asc" }, { name: "asc" }],
      }),
      prisma.requirement.findMany({
        where: { projectId, deletedAt: null },
        select: { id: true, name: true, moduleId: true },
        orderBy: [{ code: "asc" }, { name: "asc" }],
      }),
      prisma.requirement.findMany({
        where: { projectId, deletedAt: null, feature: { not: null } },
        select: { feature: true, moduleId: true },
        distinct: ["moduleId", "feature"],
        orderBy: { feature: "asc" },
      }),
      prisma.scenario.findMany({
        where: { projectId, deletedAt: null },
        select: { id: true, name: true, requirementId: true },
        orderBy: { name: "asc" },
      }),
      prisma.testGroup.findMany({
        where: { deletedAt: null, scenario: { projectId, deletedAt: null } },
        select: { id: true, name: true, scenarioId: true },
        orderBy: { sequence: "asc" },
      }),
      // Newest first: the round someone wants to look at is almost always the
      // one they just opened.
      prisma.testRun.findMany({
        where: {
          projectId,
          deletedAt: null,
          ...(filters.phase ? { phase: filters.phase } : {}),
        },
        select: { id: true, name: true, status: true },
        orderBy: { createdAt: "desc" },
      }),
      // Unfiltered on purpose, like the other option lists: choosing a phase
      // must not remove every other phase from the control that chose it.
      prisma.testRun.findMany({
        where: { projectId, deletedAt: null, phase: { not: null } },
        select: { phase: true },
        distinct: ["phase"],
        orderBy: { phase: "asc" },
      }),
      // Every round's results in one grouped query rather than a pair per
      // round.
      prisma.testRunCase.groupBy({
        by: ["testRunId", "testResult"],
        where: {
          testRun: {
            projectId,
            deletedAt: null,
            ...(filters.phase ? { phase: filters.phase } : {}),
          },
        },
        _count: { _all: true },
      }),
      prisma.testCase.count({
        // Membership in a *live* round only. An archived round still owns its
        // `TestRunCase` rows, so counting those left 142 cases "scheduled"
        // while the rounds on screen covered 21 — the difference being a round
        // that had been archived.
        where: {
          ...liveCaseInProject(projectId),
          runCases: { some: { testRun: { deletedAt: null } } },
        },
      }),
      prisma.testCase.count({
        where: {
          ...liveCaseInProject(projectId),
          runCases: { none: { testRun: { deletedAt: null } } },
        },
      }),
      /* Only the two filters this question can honour. A phase belongs to a
       * round and a Module is where a case lives; the rest of the dashboard's
       * filters — a priority, an assignee, a tag — say nothing about which
       * rounds a case has been through. */
      countCasesNeedingAttention(projectId, {
        phase: filters.phase,
        moduleId: filters.moduleId,
      }),
      /* The requirements no live Test Case reaches — the one thing this
       * panel could not show at all, since its tree is built upward from
       * cases and a Requirement with none never entered it.
       *
       * Only the filters that describe where a Requirement lives are
       * honoured. The rest ask about cases, and asking a Requirement with
       * no cases about a priority or a round has no answer — so when one
       * of those is set this query is skipped and the panel says the
       * figure is unavailable rather than showing a zero.
       *
       * `scenarios: { none: … }` covers both shapes of empty: a
       * Requirement with no Scenarios at all, and one whose Scenarios
       * hold no live case. */
      narrowsByCase(filters)
        ? []
        : prisma.requirement.findMany({
            where: {
              projectId,
              deletedAt: null,
              ...(filters.requirementId ? { id: filters.requirementId } : {}),
              ...(filters.moduleId ? { moduleId: filters.moduleId } : {}),
              ...(filters.feature ? { feature: filters.feature } : {}),
              scenarios: {
                none: {
                  deletedAt: null,
                  testGroups: {
                    some: { deletedAt: null, testCases: { some: { deletedAt: null } } },
                  },
                },
              },
            },
            select: {
              id: true,
              name: true,
              code: true,
              feature: true,
              status: true,
              module: { select: { id: true, name: true } },
            },
            orderBy: [{ code: "asc" }, { name: "asc" }],
          }),
    ]);

  /* Added to the tree they were missing from, each at the end of its own
   * Module so that nothing already on screen moves. A Module that holds
   * only untested Requirements has no node yet and gets one here, which
   * is why the list is sorted afterwards: appending would otherwise put
   * it below Modules it belongs above. */
  untestedRequirements.forEach((requirement) => {
    let moduleNode = moduleNodes.get(requirement.module.id);
    if (!moduleNode) {
      moduleNode = {
        id: requirement.module.id,
        name: requirement.module.name,
        testCaseCount: 0,
        results: emptyResults(),
        requirements: [],
      };
      moduleNodes.set(moduleNode.id, moduleNode);
      tree.push(moduleNode);
    }
    moduleNode.requirements.push({
      id: requirement.id,
      name: requirement.name,
      code: requirement.code,
      feature: requirement.feature,
      testCaseCount: 0,
      results: emptyResults(),
      isDraft: requirement.status === "DRAFT",
      scenarios: [],
    });
  });

  /* The order the Modules page uses, so a reader finds them where they
   * expect rather than in whichever order a Scenario happened to be
   * created. */
  const moduleOrder = new Map(moduleOptions.map((module, index) => [module.id, index]));
  tree.sort(
    (a, b) => (moduleOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (moduleOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );

  /* Null, not zero, while a case-level filter is on: the question cannot
   * be answered then, and a zero would read as there being nothing to
   * fix. The panel shows a sentence in its place. */
  const allRequirements = tree.flatMap((module) => module.requirements);
  const withoutCases = allRequirements.filter((requirement) => requirement.results.total === 0);
  const requirementCoverage = narrowsByCase(filters)
    ? null
    : {
        total: allRequirements.length,
        withCases: allRequirements.length - withoutCases.length,
        withoutCases: withoutCases.length,
        draftWithoutCases: withoutCases.filter((requirement) => requirement.isDraft).length,
      };

  const runProgress: DashboardRunProgress[] = testRunOptions.map((run) => {
    const byResult = zeroCountRecord(TEST_RESULT_VALUES);
    let total = 0;
    for (const row of runResultRows) {
      if (row.testRunId === run.id) {
        byResult[row.testResult] += row._count._all;
        total += row._count._all;
      }
    }
    return {
      ...run,
      total,
      recorded: total - byResult.NOT_RUN,
      byResult,
    };
  });

  return {
    hasAnyData,
    counts: {
      modules: tree.length,
      requirements: requirementNodes.size,
      scenarios: scenarios.length,
      testGroups: scenarios.reduce((sum, scenario) => sum + scenario.testGroups.length, 0),
      testCases: totalTestCases,
    },
    testCasesByResult,
    testCasesByPriority,
    testCasesByAssignee: Array.from(byAssignee.values()),
    testProgress: calculateTestProgress(testCasesWithResult, totalTestCases),
    tree,
    options: {
      modules: moduleOptions,
      features: featureRows.map((row) => ({ name: row.feature as string, moduleId: row.moduleId })),
      requirements: requirementOptions,
      scenarios: scenarioOptions,
      testGroups: testGroupOptions,
      testRuns: testRunOptions,
      phases: phaseRows.map((row) => row.phase as string),
    },
    attention,
    /* How much of the project has a test case at all, which the figures
     * above cannot say: every one of them counts test cases, and a
     * requirement with none is invisible to all of them. */
    requirementCoverage,
    runProgress,
    coverage: phaseResults
      ? { inAnyRun: totalTestCases, notInAnyRun: 0 }
      : { inAnyRun, notInAnyRun },
  };
}
