import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { searchAll } from "@/lib/search";
import { createScenario } from "@/lib/scenarios";
import { findOrCreateUnassignedRequirement } from "@/lib/requirements";
import { createModule } from "@/lib/modules";
import { archiveNote, createNote } from "@/lib/notes";
import { createTestGroup } from "@/lib/test-groups";
import { createTestCase } from "@/lib/test-cases";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";
import { POST as createProjectRoute } from "@/app/api/projects/route";
import { GET as searchRoute } from "@/app/api/search/route";
import { createUser, jsonRequest, sessionFor, uniqueCode, uniqueEmail } from "./support/fixtures";

const mockAuth = vi.mocked(auth);

async function seedHierarchy(ownerId: string) {
  const code = uniqueCode("prj-srch");
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
    const owner = await createUser(uniqueEmail("search-owner"));
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const { project } = await seedHierarchy(owner.id);

    const byName = await searchAll(owner.id, project.name);
    expect(byName.some((r) => r.type === "Project" && r.id === project.id)).toBe(true);

    const byCode = await searchAll(owner.id, project.code);
    const projectResult = byCode.find((r) => r.type === "Project" && r.id === project.id);
    expect(projectResult).toBeDefined();
    expect(projectResult?.href).toBe(`/projects/${project.id}`);
  });

  it("finds a Scenario by name and by id, with correct type/project/position", async () => {
    const owner = await createUser(uniqueEmail("search-owner"));
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const { project, requirement, scenario } = await seedHierarchy(owner.id);

    const byName = await searchAll(owner.id, scenario.name);
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
    const owner = await createUser(uniqueEmail("search-owner"));
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const { requirement, scenario, testGroup } = await seedHierarchy(owner.id);

    const results = await searchAll(owner.id, testGroup.name);
    const result = results.find((r) => r.type === "TestGroup" && r.id === testGroup.id);
    expect(result).toBeDefined();
    // Position names the chain above it, which now starts at the Requirement.
    expect(result?.position).toBe(`${requirement.name} > ${scenario.name}`);
  });

  it("finds a Test Case by name and by id, with position naming its Scenario and Test Group", async () => {
    const owner = await createUser(uniqueEmail("search-owner"));
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const { scenario, testGroup, testCase } = await seedHierarchy(owner.id);

    const byName = await searchAll(owner.id, testCase.name);
    const result = byName.find((r) => r.type === "TestCase" && r.id === testCase.id);
    expect(result).toBeDefined();
    expect(result?.position).toBe(`${scenario.name} > ${testGroup.name}`);

    const byId = await searchAll(owner.id, testCase.id);
    expect(byId.some((r) => r.type === "TestCase" && r.id === testCase.id)).toBe(true);
  });

  it("does not leak another Project's entities to a caller who isn't a member", async () => {
    const ownerA = await createUser(uniqueEmail("search-ownerA"));
    const ownerB = await createUser(uniqueEmail("search-ownerB"));

    mockAuth.mockResolvedValue(sessionFor(ownerA.id) as never);
    const { testCase } = await seedHierarchy(ownerA.id);

    /* ownerB searches for the exact name of a Test Case that really exists.
     * The hard-coded string this replaced named a Test Case nobody had made,
     * so the empty result proved only that search can miss. */
    const results = await searchAll(ownerB.id, testCase.name);
    expect(results).toHaveLength(0);

    const byId = await searchAll(ownerB.id, testCase.id);
    expect(byId).toHaveLength(0);
  });

  it("finds a Note by a word that appears only in its body", async () => {
    const owner = await createUser(uniqueEmail("search-note"));
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const { project } = await seedHierarchy(owner.id);
    const testModule = await createModule(project.id, "Policy Search", owner.id);
    await createNote(
      project.id,
      {
        moduleId: testModule.id,
        title: "Sprint 6 planning",
        body: "Policy Template ต้องรองรับการ zimbabwean clone",
      },
      owner.id,
    );

    /* The point of the whole type: every other result matches on a name, so
     * a word that lives only in the prose would find nothing at all. */
    const results = await searchAll(owner.id, "zimbabwean");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      type: "Note",
      label: "Sprint 6 planning",
      projectId: project.id,
      position: "Policy Search",
      href: `/projects/${project.id}/notes`,
    });
  });

  it("does not leak a Note from a Project the caller is not a member of", async () => {
    const owner = await createUser(uniqueEmail("search-note"));
    const outsider = await createUser(uniqueEmail("search-note"));
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const { project } = await seedHierarchy(owner.id);
    const testModule = await createModule(project.id, "Private Module", owner.id);
    await createNote(
      project.id,
      { moduleId: testModule.id, title: "Confidential retro", body: "wildebeest" },
      owner.id,
    );

    expect(await searchAll(owner.id, "wildebeest")).toHaveLength(1);
    expect(await searchAll(outsider.id, "wildebeest")).toHaveLength(0);
  });

  it("leaves an archived Note out of the results", async () => {
    const owner = await createUser(uniqueEmail("search-note"));
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const { project } = await seedHierarchy(owner.id);
    const testModule = await createModule(project.id, "Archive Module", owner.id);
    const note = await createNote(
      project.id,
      { moduleId: testModule.id, title: "Old retro", body: "narwhal" },
      owner.id,
    );

    expect(await searchAll(owner.id, "narwhal")).toHaveLength(1);
    await archiveNote(note.id, owner.id);
    expect(await searchAll(owner.id, "narwhal")).toHaveLength(0);
  });

  it("returns no results for a blank query and does not error", async () => {
    const owner = await createUser(uniqueEmail("search-owner"));
    expect(await searchAll(owner.id, "")).toEqual([]);
    expect(await searchAll(owner.id, "   ")).toEqual([]);
  });

  it("GET /api/search requires authentication and searches only the caller's memberships", async () => {
    const owner = await createUser(uniqueEmail("search-owner"));
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const { project } = await seedHierarchy(owner.id);

    const unauthenticated = await (async () => {
      mockAuth.mockResolvedValue(null as never);
      return searchRoute(jsonRequest(`http://test/api/search?q=${project.code}`, "GET"));
    })();
    expect(unauthenticated.status).toBe(401);

    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const response = await searchRoute(jsonRequest(`http://test/api/search?q=${project.code}`, "GET"));
    const body = await response.json();
    expect(body.results.some((r: { type: string; id: string }) => r.type === "Project" && r.id === project.id)).toBe(
      true,
    );
  });
});
