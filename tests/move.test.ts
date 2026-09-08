import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";
import { POST as createProjectRoute } from "@/app/api/projects/route";
import { POST as archiveProjectRoute } from "@/app/api/projects/[id]/archive/route";
import {
  GET as listScenarios,
  POST as createScenarioRoute,
} from "@/app/api/projects/[id]/scenarios/route";
import { POST as moveScenarioRoute } from "@/app/api/scenarios/[id]/move/route";
import { POST as archiveScenarioRoute } from "@/app/api/scenarios/[id]/archive/route";
import {
  GET as listTestGroups,
  POST as createTestGroupRoute,
} from "@/app/api/scenarios/[id]/test-groups/route";
import { POST as moveTestGroupRoute } from "@/app/api/test-groups/[id]/move/route";
import {
  GET as listTestCases,
  POST as createTestCaseRoute,
} from "@/app/api/test-groups/[id]/test-cases/route";
import { POST as moveTestCaseRoute } from "@/app/api/test-cases/[id]/move/route";

const mockAuth = vi.mocked(auth);

function sessionFor(userId: string) {
  return {
    user: { id: userId, email: `${userId}@example.com` },
    expires: new Date(Date.now() + 86_400_000).toISOString(),
  };
}

async function createUser(email: string) {
  return prisma.user.create({
    data: { email, passwordHash: "irrelevant", name: email },
  });
}

function jsonRequest(url: string, method: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  });
}

async function createProject(code: string) {
  return (
    await createProjectRoute(
      jsonRequest("http://test/api/projects", "POST", {
        code,
        name: `Project ${code}`,
        status: "DRAFT",
      }),
    )
  ).json();
}

async function createScenario(projectId: string, name: string) {
  return (
    await createScenarioRoute(
      jsonRequest(`http://test/api/projects/${projectId}/scenarios`, "POST", {
        name,
        expectedResult: "Result",
        priority: "MEDIUM",
      }),
      { params: Promise.resolve({ id: projectId }) },
    )
  ).json();
}

async function createTestGroup(scenarioId: string, name: string) {
  return (
    await createTestGroupRoute(
      jsonRequest(`http://test/api/scenarios/${scenarioId}/test-groups`, "POST", { name }),
      { params: Promise.resolve({ id: scenarioId }) },
    )
  ).json();
}

async function createTestCase(testGroupId: string, name: string) {
  return (
    await createTestCaseRoute(
      jsonRequest(`http://test/api/test-groups/${testGroupId}/test-cases`, "POST", {
        name,
        expectedResult: "Result",
        priority: "LOW",
        steps: [{ step: "Step", expectedResult: "Expected" }],
      }),
      { params: Promise.resolve({ id: testGroupId }) },
    )
  ).json();
}

describe("move operations", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("moves a Scenario to a different Project, carrying its Test Groups and Test Cases", async () => {
    const owner = await createUser("mv-owner1@example.com");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);

    const sourceProject = await createProject("PRJ-MV-1A");
    const targetProject = await createProject("PRJ-MV-1B");
    const scenario = await createScenario(sourceProject.id, "Movable scenario");
    const testGroup = await createTestGroup(scenario.id, "TG");
    await createTestCase(testGroup.id, "TC");

    const response = await moveScenarioRoute(
      jsonRequest(`http://test/api/scenarios/${scenario.id}/move`, "POST", {
        targetProjectId: targetProject.id,
      }),
      { params: Promise.resolve({ id: scenario.id }) },
    );
    expect(response.status).toBe(200);
    const moved = await response.json();
    expect(moved.descendantCounts).toEqual({ testGroups: 1, testCases: 1 });

    const sourceList = await (
      await listScenarios(jsonRequest(`http://test/api/projects/${sourceProject.id}/scenarios`, "GET"), {
        params: Promise.resolve({ id: sourceProject.id }),
      })
    ).json();
    expect(sourceList).toHaveLength(0);

    const targetList = await (
      await listScenarios(jsonRequest(`http://test/api/projects/${targetProject.id}/scenarios`, "GET"), {
        params: Promise.resolve({ id: targetProject.id }),
      })
    ).json();
    expect(targetList).toHaveLength(1);
    expect(targetList[0].id).toBe(scenario.id);

    const carriedTestGroups = await (
      await listTestGroups(jsonRequest(`http://test/api/scenarios/${scenario.id}/test-groups`, "GET"), {
        params: Promise.resolve({ id: scenario.id }),
      })
    ).json();
    expect(carriedTestGroups).toHaveLength(1);
  });

  it("requires editor membership on both the source and target Project to move a Scenario", async () => {
    const ownerA = await createUser("mv-ownerA@example.com");
    const ownerB = await createUser("mv-ownerB@example.com");

    mockAuth.mockResolvedValue(sessionFor(ownerA.id) as never);
    const projectA = await createProject("PRJ-MV-2A");
    const scenario = await createScenario(projectA.id, "Scenario in A");

    mockAuth.mockResolvedValue(sessionFor(ownerB.id) as never);
    const projectB = await createProject("PRJ-MV-2B");

    // ownerA has no membership on projectB, so moving into it must be rejected.
    mockAuth.mockResolvedValue(sessionFor(ownerA.id) as never);
    const response = await moveScenarioRoute(
      jsonRequest(`http://test/api/scenarios/${scenario.id}/move`, "POST", {
        targetProjectId: projectB.id,
      }),
      { params: Promise.resolve({ id: scenario.id }) },
    );
    expect(response.status).toBe(403);
  });

  it("moves a Test Group to a different Scenario, carrying its Test Cases and returning accurate descendant counts", async () => {
    const owner = await createUser("mv-owner3@example.com");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);

    const project = await createProject("PRJ-MV-3");
    const scenarioA = await createScenario(project.id, "Scenario A");
    const scenarioB = await createScenario(project.id, "Scenario B");
    const testGroup = await createTestGroup(scenarioA.id, "Movable group");
    await createTestCase(testGroup.id, "TC1");
    await createTestCase(testGroup.id, "TC2");

    const response = await moveTestGroupRoute(
      jsonRequest(`http://test/api/test-groups/${testGroup.id}/move`, "POST", {
        targetScenarioId: scenarioB.id,
      }),
      { params: Promise.resolve({ id: testGroup.id }) },
    );
    expect(response.status).toBe(200);
    const moved = await response.json();
    expect(moved.descendantCounts).toEqual({ testCases: 2 });

    const oldParentGroups = await (
      await listTestGroups(jsonRequest(`http://test/api/scenarios/${scenarioA.id}/test-groups`, "GET"), {
        params: Promise.resolve({ id: scenarioA.id }),
      })
    ).json();
    expect(oldParentGroups).toHaveLength(0);

    const newParentGroups = await (
      await listTestGroups(jsonRequest(`http://test/api/scenarios/${scenarioB.id}/test-groups`, "GET"), {
        params: Promise.resolve({ id: scenarioB.id }),
      })
    ).json();
    expect(newParentGroups).toHaveLength(1);

    const carriedTestCases = await (
      await listTestCases(jsonRequest(`http://test/api/test-groups/${testGroup.id}/test-cases`, "GET"), {
        params: Promise.resolve({ id: testGroup.id }),
      })
    ).json();
    expect(carriedTestCases).toHaveLength(2);
  });

  it("moves a Test Case to a different Test Group", async () => {
    const owner = await createUser("mv-owner4@example.com");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);

    const project = await createProject("PRJ-MV-4");
    const scenario = await createScenario(project.id, "Scenario");
    const groupA = await createTestGroup(scenario.id, "Group A");
    const groupB = await createTestGroup(scenario.id, "Group B");
    const testCase = await createTestCase(groupA.id, "Movable case");

    const response = await moveTestCaseRoute(
      jsonRequest(`http://test/api/test-cases/${testCase.id}/move`, "POST", {
        targetTestGroupId: groupB.id,
      }),
      { params: Promise.resolve({ id: testCase.id }) },
    );
    expect(response.status).toBe(200);

    const oldGroupCases = await (
      await listTestCases(jsonRequest(`http://test/api/test-groups/${groupA.id}/test-cases`, "GET"), {
        params: Promise.resolve({ id: groupA.id }),
      })
    ).json();
    expect(oldGroupCases).toHaveLength(0);

    const newGroupCases = await (
      await listTestCases(jsonRequest(`http://test/api/test-groups/${groupB.id}/test-cases`, "GET"), {
        params: Promise.resolve({ id: groupB.id }),
      })
    ).json();
    expect(newGroupCases).toHaveLength(1);
  });

  it("returns accurate descendant counts on Scenario archive", async () => {
    const owner = await createUser("mv-owner5@example.com");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);

    const project = await createProject("PRJ-MV-5");
    const scenario = await createScenario(project.id, "Scenario with children");
    const testGroup = await createTestGroup(scenario.id, "Group");
    await createTestCase(testGroup.id, "TC1");
    await createTestCase(testGroup.id, "TC2");
    await createTestCase(testGroup.id, "TC3");

    const response = await archiveScenarioRoute(
      jsonRequest(`http://test/api/scenarios/${scenario.id}/archive`, "POST"),
      { params: Promise.resolve({ id: scenario.id }) },
    );
    const archived = await response.json();
    expect(archived.descendantCounts).toEqual({ testGroups: 1, testCases: 3 });
  });

  it("requires editor membership on both projects to move a Test Group into a different project's Scenario", async () => {
    const ownerA = await createUser("mv-ownerC@example.com");
    const ownerB = await createUser("mv-ownerD@example.com");

    mockAuth.mockResolvedValue(sessionFor(ownerA.id) as never);
    const projectA = await createProject("PRJ-MV-6A");
    const scenarioA = await createScenario(projectA.id, "Scenario in A");
    const testGroup = await createTestGroup(scenarioA.id, "Group in A");

    mockAuth.mockResolvedValue(sessionFor(ownerB.id) as never);
    const projectB = await createProject("PRJ-MV-6B");
    const scenarioB = await createScenario(projectB.id, "Scenario in B");

    // ownerA has no membership on projectB, so moving the Test Group into
    // scenarioB (which belongs to projectB) must be rejected.
    mockAuth.mockResolvedValue(sessionFor(ownerA.id) as never);
    const response = await moveTestGroupRoute(
      jsonRequest(`http://test/api/test-groups/${testGroup.id}/move`, "POST", {
        targetScenarioId: scenarioB.id,
      }),
      { params: Promise.resolve({ id: testGroup.id }) },
    );
    expect(response.status).toBe(403);
  });

  it("requires editor membership on both projects to move a Test Case into a different project's Test Group", async () => {
    const ownerA = await createUser("mv-ownerE@example.com");
    const ownerB = await createUser("mv-ownerF@example.com");

    mockAuth.mockResolvedValue(sessionFor(ownerA.id) as never);
    const projectA = await createProject("PRJ-MV-7A");
    const scenarioA = await createScenario(projectA.id, "Scenario in A");
    const groupA = await createTestGroup(scenarioA.id, "Group in A");
    const testCase = await createTestCase(groupA.id, "Case in A");

    mockAuth.mockResolvedValue(sessionFor(ownerB.id) as never);
    const projectB = await createProject("PRJ-MV-7B");
    const scenarioB = await createScenario(projectB.id, "Scenario in B");
    const groupB = await createTestGroup(scenarioB.id, "Group in B");

    mockAuth.mockResolvedValue(sessionFor(ownerA.id) as never);
    const response = await moveTestCaseRoute(
      jsonRequest(`http://test/api/test-cases/${testCase.id}/move`, "POST", {
        targetTestGroupId: groupB.id,
      }),
      { params: Promise.resolve({ id: testCase.id }) },
    );
    expect(response.status).toBe(403);
  });

  it("rejects moving into an archived target Project/Scenario/Test Group", async () => {
    const owner = await createUser("mv-owner6@example.com");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);

    const sourceProject = await createProject("PRJ-MV-8A");
    const archivedTargetProject = await createProject("PRJ-MV-8B");

    await archiveProjectRoute(
      jsonRequest(`http://test/api/projects/${archivedTargetProject.id}/archive`, "POST"),
      { params: Promise.resolve({ id: archivedTargetProject.id }) },
    );

    const scenario = await createScenario(sourceProject.id, "Scenario to move");
    const response = await moveScenarioRoute(
      jsonRequest(`http://test/api/scenarios/${scenario.id}/move`, "POST", {
        targetProjectId: archivedTargetProject.id,
      }),
      { params: Promise.resolve({ id: scenario.id }) },
    );
    expect(response.status).toBe(404);
  });
});
