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

export type ProjectDashboard = {
  hasAnyData: boolean;
  counts: { scenarios: number; testGroups: number; testCases: number };
  testCasesByResult: Record<TestResult, number>;
  testCasesByPriority: Record<Priority, number>;
  testCasesByAssignee: Array<{ assigneeId: string | null; assigneeName: string; count: number }>;
  testProgress: number;
  tree: DashboardScenarioNode[];
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
      ...(filters.tags && filters.tags.length > 0 ? { tags: { hasSome: filters.tags } } : {}),
      testGroups: { some: { ...testGroupWhere, testCases: { some: testCaseWhere } } },
    },
    include: {
      requirement: { select: { moduleId: true } },
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

  const tree: DashboardScenarioNode[] = scenarios.map((scenario) => ({
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

  return {
    hasAnyData,
    counts: {
      scenarios: scenarios.length,
      testGroups: scenarios.reduce((sum, scenario) => sum + scenario.testGroups.length, 0),
      testCases: totalTestCases,
    },
    testCasesByResult,
    testCasesByPriority,
    testCasesByAssignee: Array.from(byAssignee.values()),
    testProgress: calculateTestProgress(testCasesWithResult, totalTestCases),
    tree,
  };
}
