import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";
import { POST as createProjectRoute } from "@/app/api/projects/route";
import { GET as listScenarios, POST as createScenarioRoute } from "@/app/api/projects/[id]/scenarios/route";
import {
  DELETE as deleteScenarioRoute,
  GET as getScenario,
  PATCH as patchScenario,
} from "@/app/api/scenarios/[id]/route";
import { POST as duplicateScenarioRoute } from "@/app/api/scenarios/[id]/duplicate/route";
import { POST as archiveScenarioRoute } from "@/app/api/scenarios/[id]/archive/route";
import { POST as restoreScenarioRoute } from "@/app/api/scenarios/[id]/restore/route";

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

async function createProjectAs(userId: string, code: string) {
  mockAuth.mockResolvedValue(sessionFor(userId) as never);
  const response = await createProjectRoute(
    jsonRequest("http://test/api/projects", "POST", {
      code,
      name: `Project ${code}`,
      status: "DRAFT",
    }),
  );
  return response.json();
}

describe("scenario routes", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("creates a scenario scoped to its project", async () => {
    const owner = await createUser("s-owner1@example.com");
    const project = await createProjectAs(owner.id, "PRJ-SCN-1");

    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const response = await createScenarioRoute(
      jsonRequest(`http://test/api/projects/${project.id}/scenarios`, "POST", {
        name: "Login flow",
        expectedResult: "User is redirected to dashboard",
        priority: "HIGH",
      }),
      { params: Promise.resolve({ id: project.id }) },
    );

    expect(response.status).toBe(201);
    const scenario = await response.json();
    expect(scenario.projectId).toBe(project.id);

    const listed = await (
      await listScenarios(jsonRequest(`http://test/api/projects/${project.id}/scenarios`, "GET"), {
        params: Promise.resolve({ id: project.id }),
      })
    ).json();
    expect(listed).toHaveLength(1);
  });

  it("rejects a scenario missing name or expectedResult", async () => {
    const owner = await createUser("s-owner2@example.com");
    const project = await createProjectAs(owner.id, "PRJ-SCN-2");

    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const missingName = await createScenarioRoute(
      jsonRequest(`http://test/api/projects/${project.id}/scenarios`, "POST", {
        expectedResult: "Something",
        priority: "LOW",
      }),
      { params: Promise.resolve({ id: project.id }) },
    );
    expect(missingName.status).toBe(400);

    const missingExpected = await createScenarioRoute(
      jsonRequest(`http://test/api/projects/${project.id}/scenarios`, "POST", {
        name: "No expected result",
        priority: "LOW",
      }),
      { params: Promise.resolve({ id: project.id }) },
    );
    expect(missingExpected.status).toBe(400);
  });

  it("duplicates a scenario copying fields but not creating any children", async () => {
    const owner = await createUser("s-owner3@example.com");
    const project = await createProjectAs(owner.id, "PRJ-SCN-3");

    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const created = await (
      await createScenarioRoute(
        jsonRequest(`http://test/api/projects/${project.id}/scenarios`, "POST", {
          name: "Checkout flow",
          expectedResult: "Order is placed",
          priority: "CRITICAL",
          tags: ["smoke"],
        }),
        { params: Promise.resolve({ id: project.id }) },
      )
    ).json();

    const duplicated = await (
      await duplicateScenarioRoute(
        jsonRequest(`http://test/api/scenarios/${created.id}/duplicate`, "POST"),
        { params: Promise.resolve({ id: created.id }) },
      )
    ).json();

    expect(duplicated.id).not.toBe(created.id);
    expect(duplicated.name).toBe("Checkout flow");
    expect(duplicated.tags).toEqual(["smoke"]);

    const all = await (
      await listScenarios(jsonRequest(`http://test/api/projects/${project.id}/scenarios`, "GET"), {
        params: Promise.resolve({ id: project.id }),
      })
    ).json();
    expect(all).toHaveLength(2);
  });

  it("archives, restores, and deletes-with-confirm a scenario", async () => {
    const owner = await createUser("s-owner4@example.com");
    const project = await createProjectAs(owner.id, "PRJ-SCN-4");

    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const created = await (
      await createScenarioRoute(
        jsonRequest(`http://test/api/projects/${project.id}/scenarios`, "POST", {
          name: "Archivable scenario",
          expectedResult: "Result",
          priority: "MEDIUM",
        }),
        { params: Promise.resolve({ id: project.id }) },
      )
    ).json();
    const params = Promise.resolve({ id: created.id });

    await archiveScenarioRoute(jsonRequest(`http://test/api/scenarios/${created.id}/archive`, "POST"), { params });
    const afterArchive = await (
      await listScenarios(jsonRequest(`http://test/api/projects/${project.id}/scenarios`, "GET"), {
        params: Promise.resolve({ id: project.id }),
      })
    ).json();
    expect(afterArchive).toHaveLength(0);

    await restoreScenarioRoute(jsonRequest(`http://test/api/scenarios/${created.id}/restore`, "POST"), { params });
    const afterRestore = await (
      await listScenarios(jsonRequest(`http://test/api/projects/${project.id}/scenarios`, "GET"), {
        params: Promise.resolve({ id: project.id }),
      })
    ).json();
    expect(afterRestore).toHaveLength(1);

    const deleteWithoutConfirm = await deleteScenarioRoute(
      jsonRequest(`http://test/api/scenarios/${created.id}`, "DELETE", {}),
      { params },
    );
    expect(deleteWithoutConfirm.status).toBe(400);

    const deleteWithConfirm = await deleteScenarioRoute(
      jsonRequest(`http://test/api/scenarios/${created.id}`, "DELETE", { confirm: true }),
      { params },
    );
    expect(deleteWithConfirm.status).toBe(200);

    const afterDelete = await (
      await listScenarios(jsonRequest(`http://test/api/projects/${project.id}/scenarios`, "GET"), {
        params: Promise.resolve({ id: project.id }),
      })
    ).json();
    expect(afterDelete).toHaveLength(0);
  });

  it("returns 403 for a non-member on every scenario route", async () => {
    const owner = await createUser("s-owner5@example.com");
    const outsider = await createUser("s-outsider1@example.com");
    const project = await createProjectAs(owner.id, "PRJ-SCN-5");

    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const created = await (
      await createScenarioRoute(
        jsonRequest(`http://test/api/projects/${project.id}/scenarios`, "POST", {
          name: "Restricted scenario",
          expectedResult: "Result",
          priority: "LOW",
        }),
        { params: Promise.resolve({ id: project.id }) },
      )
    ).json();

    mockAuth.mockResolvedValue(sessionFor(outsider.id) as never);
    const projectParams = Promise.resolve({ id: project.id });
    const scenarioParams = Promise.resolve({ id: created.id });

    expect(
      (
        await createScenarioRoute(
          jsonRequest(`http://test/api/projects/${project.id}/scenarios`, "POST", {
            name: "x",
            expectedResult: "x",
            priority: "LOW",
          }),
          { params: projectParams },
        )
      ).status,
    ).toBe(403);

    expect(
      (await getScenario(jsonRequest(`http://test/api/scenarios/${created.id}`, "GET"), { params: scenarioParams })).status,
    ).toBe(403);

    expect(
      (
        await patchScenario(
          jsonRequest(`http://test/api/scenarios/${created.id}`, "PATCH", {
            name: "x",
            expectedResult: "x",
            priority: "LOW",
          }),
          { params: scenarioParams },
        )
      ).status,
    ).toBe(403);

    expect(
      (await duplicateScenarioRoute(jsonRequest(`http://test/api/scenarios/${created.id}/duplicate`, "POST"), { params: scenarioParams })).status,
    ).toBe(403);

    expect(
      (await archiveScenarioRoute(jsonRequest(`http://test/api/scenarios/${created.id}/archive`, "POST"), { params: scenarioParams })).status,
    ).toBe(403);

    expect(
      (await restoreScenarioRoute(jsonRequest(`http://test/api/scenarios/${created.id}/restore`, "POST"), { params: scenarioParams })).status,
    ).toBe(403);

    expect(
      (
        await deleteScenarioRoute(jsonRequest(`http://test/api/scenarios/${created.id}`, "DELETE", { confirm: true }), {
          params: scenarioParams,
        })
      ).status,
    ).toBe(403);
  });

  it("returns 403 for a scenario when the caller belongs to a different project", async () => {
    const ownerA = await createUser("s-ownerA@example.com");
    const ownerB = await createUser("s-ownerB@example.com");
    const projectA = await createProjectAs(ownerA.id, "PRJ-SCN-A");
    await createProjectAs(ownerB.id, "PRJ-SCN-B");

    mockAuth.mockResolvedValue(sessionFor(ownerA.id) as never);
    const scenario = await (
      await createScenarioRoute(
        jsonRequest(`http://test/api/projects/${projectA.id}/scenarios`, "POST", {
          name: "Project A scenario",
          expectedResult: "Result",
          priority: "LOW",
        }),
        { params: Promise.resolve({ id: projectA.id }) },
      )
    ).json();

    // ownerB is a real member elsewhere (project B), just not of project A.
    mockAuth.mockResolvedValue(sessionFor(ownerB.id) as never);
    const response = await getScenario(
      jsonRequest(`http://test/api/scenarios/${scenario.id}`, "GET"),
      { params: Promise.resolve({ id: scenario.id }) },
    );
    expect(response.status).toBe(403);
  });
});
