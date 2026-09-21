import {
  modulesListHref,
  notesListHref,
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
 *
 * Every label is the entity's own name (not its level, e.g. "Module") —
 * `Breadcrumb` truncates a long one with an ellipsis and shows the full
 * name on hover, so nothing here needs to shorten it up front.
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

/** Members and Profile sit outside any one Project, reached from the account
 * menu rather than a Project tab — Projects is still the nearest thing this
 * app has to a home page, so it's the path back from either. */
export function membersBreadcrumb(): BreadcrumbSegment[] {
  return [PROJECTS_ROOT, { label: "Members", href: "/members" }];
}

export function profileBreadcrumb(): BreadcrumbSegment[] {
  return [PROJECTS_ROOT, { label: "Profile", href: "/profile" }];
}

export function dashboardBreadcrumb(project: NamedEntity): BreadcrumbSegment[] {
  return [...projectBreadcrumb(project), { label: "Dashboard", href: `/projects/${project.id}/dashboard` }];
}

export function auditLogBreadcrumb(project: NamedEntity): BreadcrumbSegment[] {
  return [...projectBreadcrumb(project), { label: "Audit Trail", href: `/projects/${project.id}/audit-log` }];
}

export function testRunsBreadcrumb(project: NamedEntity): BreadcrumbSegment[] {
  return [...projectBreadcrumb(project), { label: "Test Runs", href: `/projects/${project.id}/runs` }];
}

export function testRunBreadcrumb(project: NamedEntity, run: NamedEntity): BreadcrumbSegment[] {
  return [
    ...testRunsBreadcrumb(project),
    { label: run.name, href: `/projects/${project.id}/runs/${run.id}` },
  ];
}

export function filesBreadcrumb(project: NamedEntity): BreadcrumbSegment[] {
  return [...projectBreadcrumb(project), { label: "Files", href: `/projects/${project.id}/files` }];
}

export function importBreadcrumb(project: NamedEntity): BreadcrumbSegment[] {
  return [...projectBreadcrumb(project), { label: "Import", href: `/projects/${project.id}/import` }];
}

export function notesBreadcrumb(project: NamedEntity): BreadcrumbSegment[] {
  return [...projectBreadcrumb(project), { label: "Notes", href: notesListHref(project.id) }];
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
