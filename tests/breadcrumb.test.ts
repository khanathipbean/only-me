import { describe, expect, it } from "vitest";
import {
  nameOr,
  projectBreadcrumb,
  scenarioBreadcrumb,
  scenariosListBreadcrumb,
  testCaseBreadcrumb,
  testCasesListBreadcrumb,
  testGroupBreadcrumb,
  testGroupsListBreadcrumb,
} from "@/lib/breadcrumb";

const project = { id: "prj1", name: "Project A" };
const scenario = { id: "scn1", name: "Scenario A" };
const testGroup = { id: "grp1", name: "Navigation" };
const testCase = { id: "tc1", name: "TC-001" };

describe("nameOr", () => {
  it("falls back to the id when the entity is null/undefined", () => {
    expect(nameOr(project, "fallback-id")).toBe("Project A");
    expect(nameOr(null, "fallback-id")).toBe("fallback-id");
    expect(nameOr(undefined, "fallback-id")).toBe("fallback-id");
  });
});

describe("breadcrumb path builders", () => {
  it("renders the Project-level path", () => {
    expect(projectBreadcrumb(project)).toEqual([
      { label: "Projects", href: "/projects" },
      { label: "Project A", href: "/projects/prj1" },
    ]);
  });

  it("renders the Scenarios-list path", () => {
    expect(scenariosListBreadcrumb(project)).toEqual([
      { label: "Projects", href: "/projects" },
      { label: "Project A", href: "/projects/prj1" },
      { label: "Scenarios", href: "/projects/prj1/scenarios" },
    ]);
  });

  it("renders the Scenario-detail path, with a clickable 'Scenarios' segment so its list state is restorable", () => {
    expect(scenarioBreadcrumb(project, scenario)).toEqual([
      { label: "Projects", href: "/projects" },
      { label: "Project A", href: "/projects/prj1" },
      { label: "Scenarios", href: "/projects/prj1/scenarios" },
      { label: "Scenario A", href: "/projects/prj1/scenarios/scn1" },
    ]);
  });

  it("renders the Test-Groups-list path", () => {
    expect(testGroupsListBreadcrumb(project, scenario)).toEqual([
      { label: "Projects", href: "/projects" },
      { label: "Project A", href: "/projects/prj1" },
      { label: "Scenarios", href: "/projects/prj1/scenarios" },
      { label: "Scenario A", href: "/projects/prj1/scenarios/scn1" },
      { label: "Test Groups", href: "/projects/prj1/scenarios/scn1/test-groups" },
    ]);
  });

  it("renders the Test-Group-detail path, with a clickable 'Test Groups' segment", () => {
    expect(testGroupBreadcrumb(project, scenario, testGroup)).toEqual([
      { label: "Projects", href: "/projects" },
      { label: "Project A", href: "/projects/prj1" },
      { label: "Scenarios", href: "/projects/prj1/scenarios" },
      { label: "Scenario A", href: "/projects/prj1/scenarios/scn1" },
      { label: "Test Groups", href: "/projects/prj1/scenarios/scn1/test-groups" },
      { label: "Navigation", href: "/projects/prj1/scenarios/scn1/test-groups/grp1" },
    ]);
  });

  it("renders the Test-Cases-list path", () => {
    expect(testCasesListBreadcrumb(project, scenario, testGroup)).toEqual([
      { label: "Projects", href: "/projects" },
      { label: "Project A", href: "/projects/prj1" },
      { label: "Scenarios", href: "/projects/prj1/scenarios" },
      { label: "Scenario A", href: "/projects/prj1/scenarios/scn1" },
      { label: "Test Groups", href: "/projects/prj1/scenarios/scn1/test-groups" },
      { label: "Navigation", href: "/projects/prj1/scenarios/scn1/test-groups/grp1" },
      { label: "Test Cases", href: "/projects/prj1/scenarios/scn1/test-groups/grp1/test-cases" },
    ]);
  });

  it("renders the full Test-Case-detail path, with a clickable 'Test Cases' segment so its list state is restorable", () => {
    expect(testCaseBreadcrumb(project, scenario, testGroup, testCase)).toEqual([
      { label: "Projects", href: "/projects" },
      { label: "Project A", href: "/projects/prj1" },
      { label: "Scenarios", href: "/projects/prj1/scenarios" },
      { label: "Scenario A", href: "/projects/prj1/scenarios/scn1" },
      { label: "Test Groups", href: "/projects/prj1/scenarios/scn1/test-groups" },
      { label: "Navigation", href: "/projects/prj1/scenarios/scn1/test-groups/grp1" },
      { label: "Test Cases", href: "/projects/prj1/scenarios/scn1/test-groups/grp1/test-cases" },
      { label: "TC-001", href: "/projects/prj1/scenarios/scn1/test-groups/grp1/test-cases/tc1" },
    ]);
  });
});
