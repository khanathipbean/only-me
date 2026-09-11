import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { searchAll } from "@/lib/search";
import { createScenario } from "@/lib/scenarios";
import { findOrCreateUnassignedRequirement } from "@/lib/requirements";
import { createTestGroup } from "@/lib/test-groups";
import { createTestCase } from "@/lib/test-cases";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";
import { POST as createProjectRoute } from "@/app/api/projects/route";
import { GET as searchRoute } from "@/app/api/search/route";

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

async function seedHierarchy(ownerId: string, code: string) {
  const project = await (
    await createProjectRoute(
      jsonRequest("http://test/api/projects", "POST", { code, name: `Findable Project ${code}`, status: "DRAFT" }),
    )
  ).json();

  // A Scenario can only exist under a Requirement now, and the URL every
  // search result points at is nested under that Requirement's Module.
  const requirementId = await findOrCreateUnassignedRequirement(project.id, ownerId);
  const scenario = await createScenario(
    project.id,
    { name: `Login Scenario ${code}`, requirementId, expectedResult: "ok", priority: "MEDIUM" },
    ownerId,
  );
  const requirement = await prisma.requirement.findUniqueOrThrow({ where: { id: requirementId } });
  const testGroup = await createTestGroup(scenario.id, { name: `Navigation Group ${code}` }, ownerId);
  const testCase = await createTestCase(
    testGroup.id,
    {
      name: `TC Login ${code}`,
      expectedResult: "ok",
      priority: "HIGH",
      steps: [{ step: "s", expectedResult: "r" }],
    },
    ownerId,
  );

  return { project, requirement, scenario, testGroup, testCase };
}

describe("global search", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("finds a Project by name and by code", async () => {
    const owner = await createUser("search-owner1@example.com");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const { project } = await seedHierarchy(owner.id, "PRJ-SRCH-1");

    const byName = await searchAll(owner.id, "Findable Project PRJ-SRCH-1");
    expect(byName.some((r) => r.type === "Project" && r.id === project.id)).toBe(true);

    const byCode = await searchAll(owner.id, "PRJ-SRCH-1");
    const projectResult = byCode.find((r) => r.type === "Project" && r.id === project.id);
    expect(projectResult).toBeDefined();
    expect(projectResult?.href).toBe(`/projects/${project.id}`);
  });

  it("finds a Scenario by name and by id, with correct type/project/position", async () => {
    const owner = await createUser("search-owner2@example.com");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const { project, requirement, scenario } = await seedHierarchy(owner.id, "PRJ-SRCH-2");

    const byName = await searchAll(owner.id, "Login Scenario PRJ-SRCH-2");
    const result = byName.find((r) => r.type === "Scenario" && r.id === scenario.id);
    expect(result).toBeDefined();
    expect(result?.projectName).toBe(project.name);
    expect(result?.href).toBe(
      `/projects/${project.id}/modules/${requirement.moduleId}/requirements/${requirement.id}/scenarios/${scenario.id}/test-groups`,
    );

    const byId = await searchAll(owner.id, scenario.id);
    expect(byId.some((r) => r.type === "Scenario" && r.id === scenario.id)).toBe(true);
  });

  it("finds a Test Group by name, with position naming its Scenario", async () => {
    const owner = await createUser("search-owner3@example.com");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const { scenario, testGroup } = await seedHierarchy(owner.id, "PRJ-SRCH-3");

    const results = await searchAll(owner.id, "Navigation Group PRJ-SRCH-3");
    const result = results.find((r) => r.type === "TestGroup" && r.id === testGroup.id);
    expect(result).toBeDefined();
    expect(result?.position).toBe(scenario.name);
  });

  it("finds a Test Case by name and by id, with position naming its Scenario and Test Group", async () => {
    const owner = await createUser("search-owner4@example.com");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const { scenario, testGroup, testCase } = await seedHierarchy(owner.id, "PRJ-SRCH-4");

    const byName = await searchAll(owner.id, "TC Login PRJ-SRCH-4");
    const result = byName.find((r) => r.type === "TestCase" && r.id === testCase.id);
    expect(result).toBeDefined();
    expect(result?.position).toBe(`${scenario.name} > ${testGroup.name}`);

    const byId = await searchAll(owner.id, testCase.id);
    expect(byId.some((r) => r.type === "TestCase" && r.id === testCase.id)).toBe(true);
  });

  it("does not leak another Project's entities to a caller who isn't a member", async () => {
    const ownerA = await createUser("search-ownerA@example.com");
    const ownerB = await createUser("search-ownerB@example.com");

    mockAuth.mockResolvedValue(sessionFor(ownerA.id) as never);
    const { testCase } = await seedHierarchy(ownerA.id, "PRJ-SRCH-5A");

    const results = await searchAll(ownerB.id, "TC Login PRJ-SRCH-5A");
    expect(results).toHaveLength(0);

    const byId = await searchAll(ownerB.id, testCase.id);
    expect(byId).toHaveLength(0);
  });

  it("returns no results for a blank query and does not error", async () => {
    const owner = await createUser("search-owner6@example.com");
    expect(await searchAll(owner.id, "")).toEqual([]);
    expect(await searchAll(owner.id, "   ")).toEqual([]);
  });

  it("GET /api/search requires authentication and searches only the caller's memberships", async () => {
    const owner = await createUser("search-owner7@example.com");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const { project } = await seedHierarchy(owner.id, "PRJ-SRCH-7");

    const unauthenticated = await (async () => {
      mockAuth.mockResolvedValue(null as never);
      return searchRoute(jsonRequest(`http://test/api/search?q=PRJ-SRCH-7`, "GET"));
    })();
    expect(unauthenticated.status).toBe(401);

    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const response = await searchRoute(jsonRequest(`http://test/api/search?q=PRJ-SRCH-7`, "GET"));
    const body = await response.json();
    expect(body.results.some((r: { type: string; id: string }) => r.type === "Project" && r.id === project.id)).toBe(
      true,
    );
  });
});
