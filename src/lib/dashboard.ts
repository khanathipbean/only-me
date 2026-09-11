import { prisma } from "@/lib/prisma";
import { PRIORITY_VALUES, TEST_RESULT_VALUES } from "@/lib/enums";
import type { Priority, TestResult, WorkflowStatus } from "@/generated/prisma/client";

/** Pure: no divide-by-zero when a project has no Test Cases yet. */
export function calculateTestProgress(testCasesWithResult: number, totalTestCases: number): number {
  return totalTestCases === 0 ? 0 : (testCasesWithResult / totalTestCases) * 100;
}

/** Parses a bare "YYYY-MM-DD" date-only filter value as a UTC day boundary. */
export function parseUtcDateOnly(value: string | null | undefined, boundary: "start" | "end") {
  if (!value) {
    return undefined;
  }
  const suffix = boundary === "start" ? "T00:00:00.000Z" : "T23:59:59.999Z";
  const date = new Date(`${value}${suffix}`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export type DashboardFilters = {
  moduleId?: string;
  requirementId?: string;
  scenarioId?: string;
  testGroupId?: string;
  testResult?: TestResult;
  priority?: Priority;
  status?: WorkflowStatus;
  assigneeId?: string;
  tags?: string[];
  createdFrom?: Date;
  createdTo?: Date;
  updatedFrom?: Date;
  updatedTo?: Date;
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
  requirements: Array<{ id: string; name: string; moduleId: string }>;
  scenarios: Array<{ id: string; name: string; requirementId: string }>;
  testGroups: Array<{ id: string; name: string; scenarioId: string }>;
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
    ...(filters.testResult ? { testResult: filters.testResult } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.assigneeId ? { assigneeId: filters.assigneeId } : {}),
    ...(filters.createdFrom || filters.createdTo
      ? {
          createdAt: {
            ...(filters.createdFrom ? { gte: filters.createdFrom } : {}),
            ...(filters.createdTo ? { lte: filters.createdTo } : {}),
          },
        }
      : {}),
    ...(filters.updatedFrom || filters.updatedTo
      ? {
          updatedAt: {
            ...(filters.updatedFrom ? { gte: filters.updatedFrom } : {}),
            ...(filters.updatedTo ? { lte: filters.updatedTo } : {}),
          },
        }
      : {}),
  };

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
      ...(filters.moduleId ? { requirement: { moduleId: filters.moduleId } } : {}),
      ...(filters.tags && filters.tags.length > 0 ? { tags: { hasSome: filters.tags } } : {}),
      testGroups: { some: { ...testGroupWhere, testCases: { some: testCaseWhere } } },
    },
    include: {
      requirement: {
        select: {
          id: true,
          name: true,
          code: true,
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
        totalTestCases += 1;
        testCasesByResult[testCase.testResult] += 1;
        testCasesByPriority[testCase.priority] += 1;
        if (testCase.testResult !== "NOT_RUN") {
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
          testResult: testCase.testResult,
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

  const [moduleOptions, requirementOptions, scenarioOptions, testGroupOptions] =
    await Promise.all([
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
      requirements: requirementOptions,
      scenarios: scenarioOptions,
      testGroups: testGroupOptions,
    },
  };
}
