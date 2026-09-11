/**
 * The one place URLs for the Project > Module > Requirement > Scenario >
 * Test Group > Test Case hierarchy are assembled. Every level needs the ids
 * of all its ancestors, so hand-writing the template in each page, the search
 * results and the Dashboard tree is how they drift apart.
 */

export type HierarchyIds = {
  projectId: string;
  moduleId: string;
  requirementId: string;
  scenarioId?: string;
  testGroupId?: string;
  testCaseId?: string;
};

export function projectHref(projectId: string) {
  return `/projects/${projectId}`;
}

export function modulesListHref(projectId: string) {
  return `${projectHref(projectId)}/modules`;
}

export function requirementsListHref(projectId: string, moduleId: string) {
  return `${modulesListHref(projectId)}/${moduleId}/requirements`;
}

export function scenariosListHref(
  projectId: string,
  moduleId: string,
  requirementId: string,
) {
  return `${requirementsListHref(projectId, moduleId)}/${requirementId}/scenarios`;
}

export function testGroupsListHref(ids: HierarchyIds & { scenarioId: string }) {
  return `${scenariosListHref(ids.projectId, ids.moduleId, ids.requirementId)}/${ids.scenarioId}/test-groups`;
}

export function testCasesListHref(
  ids: HierarchyIds & { scenarioId: string; testGroupId: string },
) {
  return `${testGroupsListHref(ids)}/${ids.testGroupId}/test-cases`;
}

export function testCaseHref(
  ids: HierarchyIds & { scenarioId: string; testGroupId: string; testCaseId: string },
) {
  return `${testCasesListHref(ids)}/${ids.testCaseId}`;
}
