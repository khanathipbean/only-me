import { describe, expect, it } from "vitest";
import {
  auditLogBreadcrumb,
  dashboardBreadcrumb,
  filesBreadcrumb,
  importBreadcrumb,
  membersBreadcrumb,
  moduleBreadcrumb,
  modulesListBreadcrumb,
  profileBreadcrumb,
  projectBreadcrumb,
  requirementBreadcrumb,
  requirementsListBreadcrumb,
  scenarioBreadcrumb,
  scenariosListBreadcrumb,
  testCaseBreadcrumb,
  testCasesListBreadcrumb,
  testGroupBreadcrumb,
  testGroupsListBreadcrumb,
} from "@/lib/breadcrumb";

const project = { id: "prj1", name: "Project A" };
const testModule = { id: "mod1", name: "Module A" };
const requirement = { id: "req1", name: "Requirement A" };
const scenario = { id: "scn1", name: "Scenario A" };
const testGroup = { id: "grp1", name: "Test Group A" };
const testCase = { id: "tc1", name: "Test Case A" };

const PROJECTS = { label: "Projects", href: "/projects" };
const PROJECT = { label: "Project A", href: "/projects/prj1" };
const MODULES = { label: "Modules", href: "/projects/prj1/modules" };
const MODULE = { label: "Module A", href: "/projects/prj1/modules/mod1/requirements" };
const REQUIREMENT = {
  label: "Requirement A",
  href: "/projects/prj1/modules/mod1/requirements/req1/scenarios",
};
const SCENARIO = {
  label: "Scenario A",
  href: "/projects/prj1/modules/mod1/requirements/req1/scenarios/scn1/test-groups",
};
const TEST_GROUP = {
  label: "Test Group A",
  href: "/projects/prj1/modules/mod1/requirements/req1/scenarios/scn1/test-groups/grp1/test-cases",
};

describe("breadcrumb path builders", () => {
  // Every segment's label is the entity's own name — Breadcrumb truncates a
  // long one with an ellipsis and shows the full name on hover.
  it("renders the Project-level path", () => {
    expect(projectBreadcrumb(project)).toEqual([PROJECTS, PROJECT]);
  });

  it("renders the Dashboard path", () => {
    expect(dashboardBreadcrumb(project)).toEqual([
      PROJECTS,
      PROJECT,
      { label: "Dashboard", href: "/projects/prj1/dashboard" },
    ]);
  });

  it("renders the Audit Trail path", () => {
    expect(auditLogBreadcrumb(project)).toEqual([
      PROJECTS,
      PROJECT,
      { label: "Audit Trail", href: "/projects/prj1/audit-log" },
    ]);
  });

  it("renders the Files path", () => {
    expect(filesBreadcrumb(project)).toEqual([
      PROJECTS,
      PROJECT,
      { label: "Files", href: "/projects/prj1/files" },
    ]);
  });

  it("renders the Import path", () => {
    expect(importBreadcrumb(project)).toEqual([
      PROJECTS,
      PROJECT,
      { label: "Import", href: "/projects/prj1/import" },
    ]);
  });

  it("renders the Members path", () => {
    expect(membersBreadcrumb()).toEqual([PROJECTS, { label: "Members", href: "/members" }]);
  });

  it("renders the Profile path", () => {
    expect(profileBreadcrumb()).toEqual([PROJECTS, { label: "Profile", href: "/profile" }]);
  });

  it("renders the Modules-list path", () => {
    expect(modulesListBreadcrumb(project)).toEqual([PROJECTS, PROJECT, MODULES]);
  });

  /* Each entity's own segment points at the list of its children, because
   * that is where clicking it goes — only a Test Case has a page of its own.
   * The next three cases pin that: a Module's href is its Requirements list,
   * and the list builders add nothing on top of the parent's segment. */
  it("points a Module at its Requirements list", () => {
    expect(moduleBreadcrumb(project, testModule)).toEqual([PROJECTS, PROJECT, MODULES, MODULE]);
  });

  it("renders the Requirements list as the Module's own segment", () => {
    expect(requirementsListBreadcrumb(project, testModule)).toEqual(
      moduleBreadcrumb(project, testModule),
    );
  });

  it("points a Requirement at its Scenarios list", () => {
    expect(requirementBreadcrumb(project, testModule, requirement)).toEqual([
      PROJECTS,
      PROJECT,
      MODULES,
      MODULE,
      REQUIREMENT,
    ]);
  });

  it("renders the Scenarios list as the Requirement's own segment", () => {
    expect(scenariosListBreadcrumb(project, testModule, requirement)).toEqual(
      requirementBreadcrumb(project, testModule, requirement),
    );
  });

  it("points a Scenario at its Test Groups list", () => {
    expect(scenarioBreadcrumb(project, testModule, requirement, scenario)).toEqual([
      PROJECTS,
      PROJECT,
      MODULES,
      MODULE,
      REQUIREMENT,
      SCENARIO,
    ]);
  });

  it("renders the Test Groups list as the Scenario's own segment", () => {
    expect(testGroupsListBreadcrumb(project, testModule, requirement, scenario)).toEqual(
      scenarioBreadcrumb(project, testModule, requirement, scenario),
    );
  });

  it("points a Test Group at its Test Cases list", () => {
    expect(testGroupBreadcrumb(project, testModule, requirement, scenario, testGroup)).toEqual([
      PROJECTS,
      PROJECT,
      MODULES,
      MODULE,
      REQUIREMENT,
      SCENARIO,
      TEST_GROUP,
    ]);
  });

  it("renders the Test Cases list as the Test Group's own segment", () => {
    expect(
      testCasesListBreadcrumb(project, testModule, requirement, scenario, testGroup),
    ).toEqual(testGroupBreadcrumb(project, testModule, requirement, scenario, testGroup));
  });

  it("renders the full Test-Case path, the one level with a page of its own", () => {
    expect(
      testCaseBreadcrumb(project, testModule, requirement, scenario, testGroup, testCase),
    ).toEqual([
      PROJECTS,
      PROJECT,
      MODULES,
      MODULE,
      REQUIREMENT,
      SCENARIO,
      TEST_GROUP,
      {
        label: "Test Case A",
        href: `${TEST_GROUP.href}/tc1`,
      },
    ]);
  });
});
