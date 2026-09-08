export type BreadcrumbSegment = { label: string; href: string };
type NamedEntity = { id: string; name: string };

const PROJECTS_ROOT: BreadcrumbSegment = { label: "Projects", href: "/projects" };

/** An ancestor entity may have been deleted between fetches (or fail to resolve); fall back to its id as the label. */
export function nameOr(entity: { name: string } | null | undefined, fallbackId: string): string {
  return entity?.name ?? fallbackId;
}

function scenariosListSegment(project: NamedEntity): BreadcrumbSegment {
  return { label: "Scenarios", href: `/projects/${project.id}/scenarios` };
}

function testGroupsListSegment(project: NamedEntity, scenario: NamedEntity): BreadcrumbSegment {
  return {
    label: "Test Groups",
    href: `/projects/${project.id}/scenarios/${scenario.id}/test-groups`,
  };
}

function testCasesListSegment(
  project: NamedEntity,
  scenario: NamedEntity,
  testGroup: NamedEntity,
): BreadcrumbSegment {
  return {
    label: "Test Cases",
    href: `/projects/${project.id}/scenarios/${scenario.id}/test-groups/${testGroup.id}/test-cases`,
  };
}

export function projectBreadcrumb(project: NamedEntity): BreadcrumbSegment[] {
  return [PROJECTS_ROOT, { label: project.name, href: `/projects/${project.id}` }];
}

export function scenariosListBreadcrumb(project: NamedEntity): BreadcrumbSegment[] {
  return [...projectBreadcrumb(project), scenariosListSegment(project)];
}

/**
 * Includes the Scenarios list as a clickable segment (not just the Project)
 * so that navigating up from here can restore the Scenarios list's own
 * search/filter state — the list segment is exactly what a viewer lands on
 * when they click it, and it's the segment Breadcrumb's sessionStorage
 * lookup keys off of.
 */
export function scenarioBreadcrumb(project: NamedEntity, scenario: NamedEntity): BreadcrumbSegment[] {
  return [
    ...projectBreadcrumb(project),
    scenariosListSegment(project),
    { label: scenario.name, href: `/projects/${project.id}/scenarios/${scenario.id}` },
  ];
}

export function testGroupsListBreadcrumb(
  project: NamedEntity,
  scenario: NamedEntity,
): BreadcrumbSegment[] {
  return [...scenarioBreadcrumb(project, scenario), testGroupsListSegment(project, scenario)];
}

export function testGroupBreadcrumb(
  project: NamedEntity,
  scenario: NamedEntity,
  testGroup: NamedEntity,
): BreadcrumbSegment[] {
  return [
    ...scenarioBreadcrumb(project, scenario),
    testGroupsListSegment(project, scenario),
    {
      label: testGroup.name,
      href: `/projects/${project.id}/scenarios/${scenario.id}/test-groups/${testGroup.id}`,
    },
  ];
}

export function testCasesListBreadcrumb(
  project: NamedEntity,
  scenario: NamedEntity,
  testGroup: NamedEntity,
): BreadcrumbSegment[] {
  return [
    ...testGroupBreadcrumb(project, scenario, testGroup),
    testCasesListSegment(project, scenario, testGroup),
  ];
}

export function testCaseBreadcrumb(
  project: NamedEntity,
  scenario: NamedEntity,
  testGroup: NamedEntity,
  testCase: NamedEntity,
): BreadcrumbSegment[] {
  return [
    ...testGroupBreadcrumb(project, scenario, testGroup),
    testCasesListSegment(project, scenario, testGroup),
    {
      label: testCase.name,
      href: `/projects/${project.id}/scenarios/${scenario.id}/test-groups/${testGroup.id}/test-cases/${testCase.id}`,
    },
  ];
}
