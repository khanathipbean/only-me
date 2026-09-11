import {
  modulesListHref,
  requirementsListHref,
  scenariosListHref,
  testCasesListHref,
  testGroupsListHref,
} from "@/lib/hrefs";

export type BreadcrumbSegment = { label: string; href: string };
type NamedEntity = { id: string; name: string };

const PROJECTS_ROOT: BreadcrumbSegment = { label: "Projects", href: "/projects" };

/** An ancestor entity may have been deleted between fetches (or fail to resolve); fall back to its id as the label. */
export function nameOr(entity: { name: string } | null | undefined, fallbackId: string): string {
  return entity?.name ?? fallbackId;
}

/*
 * The hierarchy is Project > Module > Requirement > Scenario > Test Group >
 * Test Case, and the URL mirrors it exactly. Each entity's own segment points
 * at the list of its children, because that is where clicking it goes — only
 * a Test Case has a page of its own. That also means no separate "Requirements"
 * / "Scenarios" / "Test Groups" segment: each would be a second link to the
 * very same URL as the parent's segment.
 *
 * The Modules list keeps its own segment so navigating up can restore that
 * list's search/filter state, which Breadcrumb keys off the href.
 */

function idsFor(
  project: NamedEntity,
  module: NamedEntity,
  requirement: NamedEntity,
  scenario: NamedEntity,
) {
  return {
    projectId: project.id,
    moduleId: module.id,
    requirementId: requirement.id,
    scenarioId: scenario.id,
  };
}

export function projectBreadcrumb(project: NamedEntity): BreadcrumbSegment[] {
  return [PROJECTS_ROOT, { label: project.name, href: `/projects/${project.id}` }];
}

export function modulesListBreadcrumb(project: NamedEntity): BreadcrumbSegment[] {
  return [...projectBreadcrumb(project), { label: "Modules", href: modulesListHref(project.id) }];
}

export function moduleBreadcrumb(
  project: NamedEntity,
  module: NamedEntity,
): BreadcrumbSegment[] {
  return [
    ...modulesListBreadcrumb(project),
    { label: module.name, href: requirementsListHref(project.id, module.id) },
  ];
}

/** The Requirements list is the Module's segment — nothing to add. */
export function requirementsListBreadcrumb(
  project: NamedEntity,
  module: NamedEntity,
): BreadcrumbSegment[] {
  return moduleBreadcrumb(project, module);
}

export function requirementBreadcrumb(
  project: NamedEntity,
  module: NamedEntity,
  requirement: NamedEntity,
): BreadcrumbSegment[] {
  return [
    ...moduleBreadcrumb(project, module),
    { label: requirement.name, href: scenariosListHref(project.id, module.id, requirement.id) },
  ];
}

export function scenariosListBreadcrumb(
  project: NamedEntity,
  module: NamedEntity,
  requirement: NamedEntity,
): BreadcrumbSegment[] {
  return requirementBreadcrumb(project, module, requirement);
}

export function scenarioBreadcrumb(
  project: NamedEntity,
  module: NamedEntity,
  requirement: NamedEntity,
  scenario: NamedEntity,
): BreadcrumbSegment[] {
  return [
    ...requirementBreadcrumb(project, module, requirement),
    {
      label: scenario.name,
      href: testGroupsListHref(idsFor(project, module, requirement, scenario)),
    },
  ];
}

export function testGroupsListBreadcrumb(
  project: NamedEntity,
  module: NamedEntity,
  requirement: NamedEntity,
  scenario: NamedEntity,
): BreadcrumbSegment[] {
  return scenarioBreadcrumb(project, module, requirement, scenario);
}

export function testGroupBreadcrumb(
  project: NamedEntity,
  module: NamedEntity,
  requirement: NamedEntity,
  scenario: NamedEntity,
  testGroup: NamedEntity,
): BreadcrumbSegment[] {
  return [
    ...scenarioBreadcrumb(project, module, requirement, scenario),
    {
      label: testGroup.name,
      href: testCasesListHref({ ...idsFor(project, module, requirement, scenario), testGroupId: testGroup.id }),
    },
  ];
}

export function testCasesListBreadcrumb(
  project: NamedEntity,
  module: NamedEntity,
  requirement: NamedEntity,
  scenario: NamedEntity,
  testGroup: NamedEntity,
): BreadcrumbSegment[] {
  return testGroupBreadcrumb(project, module, requirement, scenario, testGroup);
}

/** A Test Case still has a page of its own, so it keeps a real leaf segment. */
export function testCaseBreadcrumb(
  project: NamedEntity,
  module: NamedEntity,
  requirement: NamedEntity,
  scenario: NamedEntity,
  testGroup: NamedEntity,
  testCase: NamedEntity,
): BreadcrumbSegment[] {
  return [
    ...testGroupBreadcrumb(project, module, requirement, scenario, testGroup),
    {
      label: testCase.name,
      href: `${testCasesListHref({ ...idsFor(project, module, requirement, scenario), testGroupId: testGroup.id })}/${testCase.id}`,
    },
  ];
}
