import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";
import { POST as createProjectRoute } from "@/app/api/projects/route";
import { POST as createScenarioRoute } from "@/app/api/projects/[id]/scenarios/route";
import {
  GET as listTestGroups,
  POST as createTestGroupRoute,
} from "@/app/api/scenarios/[id]/test-groups/route";
import {
  DELETE as deleteTestGroupRoute,
  GET as getTestGroup,
} from "@/app/api/test-groups/[id]/route";
import { POST as duplicateTestGroupRoute } from "@/app/api/test-groups/[id]/duplicate/route";
import { POST as archiveTestGroupRoute } from "@/app/api/test-groups/[id]/archive/route";
import { POST as restoreTestGroupRoute } from "@/app/api/test-groups/[id]/restore/route";
import { POST as reorderTestGroupsRoute } from "@/app/api/test-groups/reorder/route";

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

async function setup(ownerEmail: string, code: string) {
  const owner = await createUser(ownerEmail);
  mockAuth.mockResolvedValue(sessionFor(owner.id) as never);

  const project = await (
    await createProjectRoute(
      jsonRequest("http://test/api/projects", "POST", {
        code,
        name: `Project ${code}`,
        status: "DRAFT",
      }),
    )
  ).json();

  const scenario = await (
    await createScenarioRoute(
      jsonRequest(`http://test/api/projects/${project.id}/scenarios`, "POST", {
        name: `Scenario for ${code}`,
        expectedResult: "Result",
        priority: "MEDIUM",
      }),
      { params: Promise.resolve({ id: project.id }) },
    )
  ).json();

  return { owner, project, scenario };
}

describe("test group routes", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("creates a test group under a scenario, requiring the scenario to exist", async () => {
    const { owner, scenario } = await setup("tg-owner1@example.com", "PRJ-TG-1");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);

    const response = await createTestGroupRoute(
      jsonRequest(`http://test/api/scenarios/${scenario.id}/test-groups`, "POST", {
        name: "Navigation",
      }),
      { params: Promise.resolve({ id: scenario.id }) },
    );
    expect(response.status).toBe(201);
    const testGroup = await response.json();
    expect(testGroup.scenarioId).toBe(scenario.id);

    const missingScenario = await createTestGroupRoute(
      jsonRequest("http://test/api/scenarios/does-not-exist/test-groups", "POST", {
        name: "Navigation",
      }),
      { params: Promise.resolve({ id: "does-not-exist" }) },
    );
    expect(missingScenario.status).toBe(404);
  });

  it("reorders test groups and persists the new sequence", async () => {
    const { owner, scenario } = await setup("tg-owner2@example.com", "PRJ-TG-2");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);

    const first = await (
      await createTestGroupRoute(
        jsonRequest(`http://test/api/scenarios/${scenario.id}/test-groups`, "POST", { name: "First" }),
        { params: Promise.resolve({ id: scenario.id }) },
      )
    ).json();
    const second = await (
      await createTestGroupRoute(
        jsonRequest(`http://test/api/scenarios/${scenario.id}/test-groups`, "POST", { name: "Second" }),
        { params: Promise.resolve({ id: scenario.id }) },
      )
    ).json();

    await reorderTestGroupsRoute(
      jsonRequest("http://test/api/test-groups/reorder", "POST", {
        scenarioId: scenario.id,
        orderedIds: [second.id, first.id],
      }),
    );

    const ordered = await (
      await listTestGroups(jsonRequest(`http://test/api/scenarios/${scenario.id}/test-groups`, "GET"), {
        params: Promise.resolve({ id: scenario.id }),
      })
    ).json();

    expect(ordered.map((tg: { id: string }) => tg.id)).toEqual([second.id, first.id]);
  });

  it("duplicates, archives, restores, and deletes-with-confirm a test group", async () => {
    const { owner, scenario } = await setup("tg-owner3@example.com", "PRJ-TG-3");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);

    const created = await (
      await createTestGroupRoute(
        jsonRequest(`http://test/api/scenarios/${scenario.id}/test-groups`, "POST", { name: "Functional" }),
        { params: Promise.resolve({ id: scenario.id }) },
      )
    ).json();

    const duplicated = await (
      await duplicateTestGroupRoute(
        jsonRequest(`http://test/api/test-groups/${created.id}/duplicate`, "POST"),
        { params: Promise.resolve({ id: created.id }) },
      )
    ).json();
    expect(duplicated.id).not.toBe(created.id);
    expect(duplicated.name).toBe("Functional");

    const params = Promise.resolve({ id: created.id });
    await archiveTestGroupRoute(jsonRequest(`http://test/api/test-groups/${created.id}/archive`, "POST"), { params });

    const afterArchive = await (
      await listTestGroups(jsonRequest(`http://test/api/scenarios/${scenario.id}/test-groups`, "GET"), {
        params: Promise.resolve({ id: scenario.id }),
      })
    ).json();
    expect(afterArchive.find((tg: { id: string }) => tg.id === created.id)).toBeUndefined();

    await restoreTestGroupRoute(jsonRequest(`http://test/api/test-groups/${created.id}/restore`, "POST"), { params });
    const afterRestore = await (
      await listTestGroups(jsonRequest(`http://test/api/scenarios/${scenario.id}/test-groups`, "GET"), {
        params: Promise.resolve({ id: scenario.id }),
      })
    ).json();
    expect(afterRestore.find((tg: { id: string }) => tg.id === created.id)).toBeDefined();

    const deleteWithoutConfirm = await deleteTestGroupRoute(
      jsonRequest(`http://test/api/test-groups/${created.id}`, "DELETE", {}),
      { params },
    );
    expect(deleteWithoutConfirm.status).toBe(400);

    const deleteWithConfirm = await deleteTestGroupRoute(
      jsonRequest(`http://test/api/test-groups/${created.id}`, "DELETE", { confirm: true }),
      { params },
    );
    expect(deleteWithConfirm.status).toBe(200);
  });

  it("returns 403 for a non-member on every test group route", async () => {
    const { owner, scenario } = await setup("tg-owner4@example.com", "PRJ-TG-4");
    const outsider = await createUser("tg-outsider1@example.com");

    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const created = await (
      await createTestGroupRoute(
        jsonRequest(`http://test/api/scenarios/${scenario.id}/test-groups`, "POST", { name: "Restricted" }),
        { params: Promise.resolve({ id: scenario.id }) },
      )
    ).json();

    mockAuth.mockResolvedValue(sessionFor(outsider.id) as never);
    const scenarioParams = Promise.resolve({ id: scenario.id });
    const testGroupParams = Promise.resolve({ id: created.id });

    expect(
      (
        await createTestGroupRoute(
          jsonRequest(`http://test/api/scenarios/${scenario.id}/test-groups`, "POST", { name: "x" }),
          { params: scenarioParams },
        )
      ).status,
    ).toBe(403);

    expect(
      (await getTestGroup(jsonRequest(`http://test/api/test-groups/${created.id}`, "GET"), { params: testGroupParams })).status,
    ).toBe(403);

    expect(
      (
        await duplicateTestGroupRoute(jsonRequest(`http://test/api/test-groups/${created.id}/duplicate`, "POST"), {
          params: testGroupParams,
        })
      ).status,
    ).toBe(403);

    expect(
      (
        await archiveTestGroupRoute(jsonRequest(`http://test/api/test-groups/${created.id}/archive`, "POST"), {
          params: testGroupParams,
        })
      ).status,
    ).toBe(403);

    expect(
      (
        await restoreTestGroupRoute(jsonRequest(`http://test/api/test-groups/${created.id}/restore`, "POST"), {
          params: testGroupParams,
        })
      ).status,
    ).toBe(403);

    expect(
      (
        await deleteTestGroupRoute(jsonRequest(`http://test/api/test-groups/${created.id}`, "DELETE", { confirm: true }), {
          params: testGroupParams,
        })
      ).status,
    ).toBe(403);

    expect(
      (
        await reorderTestGroupsRoute(
          jsonRequest("http://test/api/test-groups/reorder", "POST", {
            scenarioId: scenario.id,
            orderedIds: [created.id],
          }),
        )
      ).status,
    ).toBe(403);
  });

  it("rejects reorder when orderedIds don't exactly match the scenario's own test groups", async () => {
    const { owner, scenario } = await setup("tg-owner5@example.com", "PRJ-TG-5");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);

    const own = await (
      await createTestGroupRoute(
        jsonRequest(`http://test/api/scenarios/${scenario.id}/test-groups`, "POST", { name: "Own" }),
        { params: Promise.resolve({ id: scenario.id }) },
      )
    ).json();

    // A Test Group from a different Scenario, in a different Project, but the
    // same authorized user — isolates the "wrong scenario" bug from the
    // already-covered cross-project 403 case.
    const otherProject = await (
      await createProjectRoute(
        jsonRequest("http://test/api/projects", "POST", {
          code: "PRJ-TG-5B",
          name: "Project PRJ-TG-5B",
          status: "DRAFT",
        }),
      )
    ).json();
    const otherScenario = await (
      await createScenarioRoute(
        jsonRequest(`http://test/api/projects/${otherProject.id}/scenarios`, "POST", {
          name: "Other scenario",
          expectedResult: "Result",
          priority: "LOW",
        }),
        { params: Promise.resolve({ id: otherProject.id }) },
      )
    ).json();
    const foreign = await (
      await createTestGroupRoute(
        jsonRequest(`http://test/api/scenarios/${otherScenario.id}/test-groups`, "POST", { name: "Foreign" }),
        { params: Promise.resolve({ id: otherScenario.id }) },
      )
    ).json();

    const response = await reorderTestGroupsRoute(
      jsonRequest("http://test/api/test-groups/reorder", "POST", {
        scenarioId: scenario.id,
        orderedIds: [foreign.id, own.id],
      }),
    );
    expect(response.status).toBe(400);

    const unchanged = await (
      await listTestGroups(jsonRequest(`http://test/api/scenarios/${scenario.id}/test-groups`, "GET"), {
        params: Promise.resolve({ id: scenario.id }),
      })
    ).json();
    expect(unchanged.map((tg: { id: string }) => tg.id)).toEqual([own.id]);
  });
});
