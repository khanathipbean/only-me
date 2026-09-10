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
 * A Scenario's own segment points at its Test Groups list, because that is
 * where clicking a Scenario goes now — the Scenario has no page of its own
 * any more, its Manage lives in the row's Edit dialog. That also makes the
 * separate "Test Groups" segment redundant, so it's gone: it would have been
 * a second link to the very same URL.
 *
 * The Scenarios list stays as its own segment so navigating up can restore
 * that list's search/filter state, which Breadcrumb keys off the href.
 */
export function scenarioBreadcrumb(project: NamedEntity, scenario: NamedEntity): BreadcrumbSegment[] {
  return [
    ...projectBreadcrumb(project),
    scenariosListSegment(project),
    { label: scenario.name, href: testGroupsListSegment(project, scenario).href },
  ];
}

/** The Test Groups list is the Scenario's segment — nothing to add. */
export function testGroupsListBreadcrumb(
  project: NamedEntity,
  scenario: NamedEntity,
): BreadcrumbSegment[] {
  return scenarioBreadcrumb(project, scenario);
}

/** Likewise a Test Group's segment points at its Test Cases list. */
export function testGroupBreadcrumb(
  project: NamedEntity,
  scenario: NamedEntity,
  testGroup: NamedEntity,
): BreadcrumbSegment[] {
  return [
    ...scenarioBreadcrumb(project, scenario),
    {
      label: testGroup.name,
      href: testCasesListSegment(project, scenario, testGroup).href,
    },
  ];
}

export function testCasesListBreadcrumb(
  project: NamedEntity,
  scenario: NamedEntity,
  testGroup: NamedEntity,
): BreadcrumbSegment[] {
  return testGroupBreadcrumb(project, scenario, testGroup);
}

/** A Test Case still has a page of its own, so it keeps a real leaf segment. */
export function testCaseBreadcrumb(
  project: NamedEntity,
  scenario: NamedEntity,
  testGroup: NamedEntity,
  testCase: NamedEntity,
): BreadcrumbSegment[] {
  return [
    ...testGroupBreadcrumb(project, scenario, testGroup),
    {
      label: testCase.name,
      href: `/projects/${project.id}/scenarios/${scenario.id}/test-groups/${testGroup.id}/test-cases/${testCase.id}`,
    },
  ];
}
