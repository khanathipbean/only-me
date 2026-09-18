import { prisma } from "@/lib/prisma";
import { PRIORITY_VALUES, TEST_RESULT_VALUES } from "@/lib/enums";
import type {
  Priority,
  TestResult,
  TestRunStatus,
  WorkflowStatus,
} from "@/generated/prisma/client";

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
  testCases: DashboardTestCaseNode[];
};

export type DashboardScenarioNode = {
  id: string;
  name: string;
  /** Its ancestors, so the tree can link into the nested URL. */
  moduleId: string;
  requirementId: string;
  testCaseCount: number;
  testGroups: DashboardTestGroupNode[];
};

export type DashboardRequirementNode = {
  id: string;
  name: string;
  code: string | null;
  feature: string | null;
  testCaseCount: number;
  scenarios: DashboardScenarioNode[];
};

export type DashboardModuleNode = {
  id: string;
  name: string;
  testCaseCount: number;
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
  /** The rounds of testing this project has had, newest first. */
  testRuns: Array<{ id: string; name: string; status: TestRunStatus }>;
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
};

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

  const testCaseWhere = {
    deletedAt: null,
    ...(filters.search
      ? { name: { contains: filters.search, mode: "insensitive" as const } }
      : {}),
    /* With a run chosen, membership *and* the result filter both go through
     * `runCases`: the result that matters is the one recorded in that round,
     * not the copy left on the Test Case by whichever round wrote last. */
    ...(filters.testRunId
      ? {
          runCases: {
            some: {
              testRunId: filters.testRunId,
              ...(filters.testResult ? { testResult: filters.testResult } : {}),
            },
          },
        }
      : filters.testResult
        ? { testResult: filters.testResult }
        : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.assigneeId ? { assigneeId: filters.assigneeId } : {}),
  };

  /* One query for the chosen round's results, so the loop below can read each
   * case's result for that round instead of the mirrored one. */
  const runResults = filters.testRunId
    ? new Map(
        (
          await prisma.testRunCase.findMany({
            where: { testRunId: filters.testRunId },
            select: { testCaseId: true, testResult: true },
          })
        ).map((runCase) => [runCase.testCaseId, runCase.testResult]),
      )
    : null;

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
    testGroups: scenario.testGroups.map((group) => ({
      id: group.id,
      name: group.name,
      testCaseCount: group.testCases.length,
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
        scenarios: [],
      };
      requirementNodes.set(requirement.id, requirementNode);
      moduleNode.requirements.push(requirementNode);
    }

    requirementNode.scenarios.push(node);
    requirementNode.testCaseCount += node.testCaseCount;
    moduleNode.testCaseCount += node.testCaseCount;
  });

  const tree = Array.from(moduleNodes.values());

  const [
    moduleOptions,
    requirementOptions,
    featureRows,
    scenarioOptions,
    testGroupOptions,
    testRunOptions,
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
        where: { projectId, deletedAt: null },
        select: { id: true, name: true, status: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

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
    },
  };
}
