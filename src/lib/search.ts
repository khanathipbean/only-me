import { prisma } from "@/lib/prisma";
import {
  requirementsListHref,
  scenariosListHref,
  testCaseHref,
  testCasesListHref,
  testGroupsListHref,
} from "@/lib/hrefs";

export type SearchResultType =
  | "Project"
  | "Module"
  | "Requirement"
  | "Scenario"
  | "TestGroup"
  | "TestCase";

export type SearchResult = {
  type: SearchResultType;
  id: string;
  label: string;
  projectId: string;
  projectName: string;
  /** Ancestor chain within the Project, excluding the result itself and the Project (already shown separately). */
  position: string;
  href: string;
};

/**
 * Searches Project (name/code), Module (name), Requirement (name/code),
 * Scenario (name/id), Test Group (name), and Test Case (name/id), scoped to
 * Projects the caller is a member of. Every level of the hierarchy is
 * covered, because this is the only way to reach a row without walking down
 * from the Modules tab.
 */
export async function searchAll(userId: string, query: string): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const memberships = await prisma.projectMember.findMany({
    where: { userId },
    select: { projectId: true },
  });
  const memberProjectIds = memberships.map((m) => m.projectId);
  if (memberProjectIds.length === 0) {
    return [];
  }

  const textMatch = { contains: trimmed, mode: "insensitive" as const };

  const [projects, modules, requirements, scenarios, testGroups, testCases] = await Promise.all([
    prisma.project.findMany({
      where: {
        id: { in: memberProjectIds },
        deletedAt: null,
        OR: [{ name: textMatch }, { code: textMatch }],
      },
    }),
    prisma.module.findMany({
      where: { projectId: { in: memberProjectIds }, deletedAt: null, name: textMatch },
      include: { project: { select: { id: true, name: true } } },
    }),
    prisma.requirement.findMany({
      where: {
        projectId: { in: memberProjectIds },
        deletedAt: null,
        OR: [{ name: textMatch }, { code: textMatch }],
      },
      include: { project: { select: { id: true, name: true } }, module: true },
    }),
    prisma.scenario.findMany({
      where: {
        projectId: { in: memberProjectIds },
        deletedAt: null,
        OR: [{ name: textMatch }, { id: trimmed }],
      },
      include: {
        project: { select: { id: true, name: true } },
        requirement: { include: { module: { select: { id: true, name: true } } } },
      },
    }),
    prisma.testGroup.findMany({
      where: {
        name: textMatch,
        deletedAt: null,
        scenario: { projectId: { in: memberProjectIds }, deletedAt: null },
      },
      include: {
        scenario: {
          include: {
            project: { select: { id: true, name: true } },
            requirement: { include: { module: { select: { id: true, name: true } } } },
          },
        },
      },
    }),
    prisma.testCase.findMany({
      where: {
        deletedAt: null,
        OR: [{ name: textMatch }, { id: trimmed }],
        testGroup: {
          deletedAt: null,
          scenario: { projectId: { in: memberProjectIds }, deletedAt: null },
        },
      },
      include: {
        testGroup: {
          include: {
            scenario: {
              include: {
                project: { select: { id: true, name: true } },
                requirement: { include: { module: { select: { id: true, name: true } } } },
              },
            },
          },
        },
      },
    }),
  ]);

  const results: SearchResult[] = [
    ...projects.map((project) => ({
      type: "Project" as const,
      id: project.id,
      label: project.name,
      projectId: project.id,
      projectName: project.name,
      position: "",
      href: `/projects/${project.id}`,
    })),
    ...modules.map((module) => ({
      type: "Module" as const,
      id: module.id,
      label: module.name,
      projectId: module.project.id,
      projectName: module.project.name,
      position: "",
      href: requirementsListHref(module.project.id, module.id),
    })),
    ...requirements.map((requirement) => ({
      type: "Requirement" as const,
      id: requirement.id,
      label: requirement.code ? `${requirement.code} — ${requirement.name}` : requirement.name,
      projectId: requirement.project.id,
      projectName: requirement.project.name,
      position: requirement.module.name,
      href: scenariosListHref(requirement.project.id, requirement.moduleId, requirement.id),
    })),
    ...scenarios.map((scenario) => ({
      type: "Scenario" as const,
      id: scenario.id,
      label: scenario.name,
      projectId: scenario.project.id,
      projectName: scenario.project.name,
      position: `${scenario.requirement.module.name} > ${scenario.requirement.name}`,
      // Scenarios and Test Groups have no page of their own any more, so a
      // result opens the list of what they contain.
      href: testGroupsListHref({
        projectId: scenario.project.id,
        moduleId: scenario.requirement.moduleId,
        requirementId: scenario.requirementId,
        scenarioId: scenario.id,
      }),
    })),
    ...testGroups.map((testGroup) => ({
      type: "TestGroup" as const,
      id: testGroup.id,
      label: testGroup.name,
      projectId: testGroup.scenario.project.id,
      projectName: testGroup.scenario.project.name,
      position: `${testGroup.scenario.requirement.name} > ${testGroup.scenario.name}`,
      href: testCasesListHref({
        projectId: testGroup.scenario.project.id,
        moduleId: testGroup.scenario.requirement.moduleId,
        requirementId: testGroup.scenario.requirementId,
        scenarioId: testGroup.scenario.id,
        testGroupId: testGroup.id,
      }),
    })),
    ...testCases.map((testCase) => ({
      type: "TestCase" as const,
      id: testCase.id,
      label: testCase.name,
      projectId: testCase.testGroup.scenario.project.id,
      projectName: testCase.testGroup.scenario.project.name,
      position: `${testCase.testGroup.scenario.name} > ${testCase.testGroup.name}`,
      href: testCaseHref({
        projectId: testCase.testGroup.scenario.project.id,
        moduleId: testCase.testGroup.scenario.requirement.moduleId,
        requirementId: testCase.testGroup.scenario.requirementId,
        scenarioId: testCase.testGroup.scenario.id,
        testGroupId: testCase.testGroup.id,
        testCaseId: testCase.id,
      }),
    })),
  ];

  return results;
}
