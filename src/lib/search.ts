import { prisma } from "@/lib/prisma";

export type SearchResultType = "Project" | "Scenario" | "TestGroup" | "TestCase";

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
 * Searches Project (name/code), Scenario (name/id), Test Group (name), and
 * Test Case (name/id), scoped to Projects the caller is a member of.
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

  const [projects, scenarios, testGroups, testCases] = await Promise.all([
    prisma.project.findMany({
      where: {
        id: { in: memberProjectIds },
        deletedAt: null,
        OR: [{ name: textMatch }, { code: textMatch }],
      },
    }),
    prisma.scenario.findMany({
      where: {
        projectId: { in: memberProjectIds },
        deletedAt: null,
        OR: [{ name: textMatch }, { id: trimmed }],
      },
      include: { project: { select: { id: true, name: true } } },
    }),
    prisma.testGroup.findMany({
      where: {
        name: textMatch,
        deletedAt: null,
        scenario: { projectId: { in: memberProjectIds }, deletedAt: null },
      },
      include: {
        scenario: { include: { project: { select: { id: true, name: true } } } },
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
          include: { scenario: { include: { project: { select: { id: true, name: true } } } } },
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
    ...scenarios.map((scenario) => ({
      type: "Scenario" as const,
      id: scenario.id,
      label: scenario.name,
      projectId: scenario.project.id,
      projectName: scenario.project.name,
      position: "",
      // Scenarios and Test Groups have no page of their own any more, so a
      // result opens the list of what they contain.
      href: `/projects/${scenario.project.id}/scenarios/${scenario.id}/test-groups`,
    })),
    ...testGroups.map((testGroup) => ({
      type: "TestGroup" as const,
      id: testGroup.id,
      label: testGroup.name,
      projectId: testGroup.scenario.project.id,
      projectName: testGroup.scenario.project.name,
      position: testGroup.scenario.name,
      href: `/projects/${testGroup.scenario.project.id}/scenarios/${testGroup.scenario.id}/test-groups/${testGroup.id}/test-cases`,
    })),
    ...testCases.map((testCase) => ({
      type: "TestCase" as const,
      id: testCase.id,
      label: testCase.name,
      projectId: testCase.testGroup.scenario.project.id,
      projectName: testCase.testGroup.scenario.project.name,
      position: `${testCase.testGroup.scenario.name} > ${testCase.testGroup.name}`,
      href: `/projects/${testCase.testGroup.scenario.project.id}/scenarios/${testCase.testGroup.scenario.id}/test-groups/${testCase.testGroup.id}/test-cases/${testCase.id}`,
    })),
  ];

  return results;
}
