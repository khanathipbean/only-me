import { describe, expect, it } from "vitest";
import {
  moduleBreadcrumb,
  modulesListBreadcrumb,
  nameOr,
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
const testModule = { id: "mod1", name: "Dashboard" };
const requirement = { id: "req1", name: "Requirement A" };
const scenario = { id: "scn1", name: "Scenario A" };
const testGroup = { id: "grp1", name: "Navigation" };
const testCase = { id: "tc1", name: "TC-001" };

const PROJECTS = { label: "Projects", href: "/projects" };
const PROJECT = { label: "Project A", href: "/projects/prj1" };
const MODULES = { label: "Modules", href: "/projects/prj1/modules" };
const MODULE = { label: "Dashboard", href: "/projects/prj1/modules/mod1/requirements" };
const REQUIREMENT = {
  label: "Requirement A",
  href: "/projects/prj1/modules/mod1/requirements/req1/scenarios",
};
const SCENARIO = {
  label: "Scenario A",
  href: "/projects/prj1/modules/mod1/requirements/req1/scenarios/scn1/test-groups",
};
const TEST_GROUP = {
  label: "Navigation",
  href: "/projects/prj1/modules/mod1/requirements/req1/scenarios/scn1/test-groups/grp1/test-cases",
};

describe("nameOr", () => {
  it("falls back to the id when the entity is null/undefined", () => {
    expect(nameOr(project, "fallback-id")).toBe("Project A");
    expect(nameOr(null, "fallback-id")).toBe("fallback-id");
    expect(nameOr(undefined, "fallback-id")).toBe("fallback-id");
  });
});

describe("breadcrumb path builders", () => {
  it("renders the Project-level path", () => {
    expect(projectBreadcrumb(project)).toEqual([PROJECTS, PROJECT]);
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
        label: "TC-001",
        href: `${TEST_GROUP.href}/tc1`,
      },
    ]);
  });
});
