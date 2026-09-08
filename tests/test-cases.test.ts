import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";
import { POST as createProjectRoute } from "@/app/api/projects/route";
import { POST as createScenarioRoute } from "@/app/api/projects/[id]/scenarios/route";
import { POST as createTestGroupRoute } from "@/app/api/scenarios/[id]/test-groups/route";
import {
  GET as listTestCases,
  POST as createTestCaseRoute,
} from "@/app/api/test-groups/[id]/test-cases/route";
import {
  DELETE as deleteTestCaseRoute,
  GET as getTestCase,
  PATCH as patchTestCase,
} from "@/app/api/test-cases/[id]/route";
import { POST as duplicateTestCaseRoute } from "@/app/api/test-cases/[id]/duplicate/route";
import { POST as archiveTestCaseRoute } from "@/app/api/test-cases/[id]/archive/route";
import { POST as restoreTestCaseRoute } from "@/app/api/test-cases/[id]/restore/route";
import { PATCH as patchAssigneeRoute } from "@/app/api/test-cases/[id]/assignee/route";
import {
  GET as listAttachmentsRoute,
  POST as uploadAttachmentRoute,
} from "@/app/api/test-cases/[id]/attachments/route";

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

  const testGroup = await (
    await createTestGroupRoute(
      jsonRequest(`http://test/api/scenarios/${scenario.id}/test-groups`, "POST", {
        name: `Test Group for ${code}`,
      }),
      { params: Promise.resolve({ id: scenario.id }) },
    )
  ).json();

  return { owner, project, scenario, testGroup };
}

async function addMember(projectId: string, userId: string, role: "TESTER" | "VIEWER") {
  await prisma.projectMember.create({ data: { projectId, userId, role } });
}

describe("test case routes", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("creates a test case requiring name, steps, and expectedResult, defaulting to NOT_RUN", async () => {
    const { owner, testGroup } = await setup("tc-owner1@example.com", "PRJ-TC-1");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);

    const missingSteps = await createTestCaseRoute(
      jsonRequest(`http://test/api/test-groups/${testGroup.id}/test-cases`, "POST", {
        name: "No steps",
        expectedResult: "Something",
        priority: "HIGH",
        steps: [],
      }),
      { params: Promise.resolve({ id: testGroup.id }) },
    );
    expect(missingSteps.status).toBe(400);

    const missingName = await createTestCaseRoute(
      jsonRequest(`http://test/api/test-groups/${testGroup.id}/test-cases`, "POST", {
        expectedResult: "Something",
        priority: "HIGH",
        steps: [{ step: "Click login", expectedResult: "Dashboard shown" }],
      }),
      { params: Promise.resolve({ id: testGroup.id }) },
    );
    expect(missingName.status).toBe(400);

    const response = await createTestCaseRoute(
      jsonRequest(`http://test/api/test-groups/${testGroup.id}/test-cases`, "POST", {
        name: "Login succeeds",
        expectedResult: "User reaches dashboard",
        priority: "HIGH",
        steps: [
          { step: "Enter valid credentials", expectedResult: "Fields accept input" },
          { step: "Click Login", expectedResult: "Redirected to dashboard" },
        ],
      }),
      { params: Promise.resolve({ id: testGroup.id }) },
    );
    expect(response.status).toBe(201);
    const testCase = await response.json();
    expect(testCase.testResult).toBe("NOT_RUN");

    const detail = await (
      await getTestCase(jsonRequest(`http://test/api/test-cases/${testCase.id}`, "GET"), {
        params: Promise.resolve({ id: testCase.id }),
      })
    ).json();
    expect(detail.steps).toHaveLength(2);
    expect(detail.steps[0].step).toBe("Enter valid credentials");
  });

  it("rejects a Tester's attempt to edit a restricted field but allows testResult/notes", async () => {
    const { owner, project, testGroup } = await setup("tc-owner2@example.com", "PRJ-TC-2");
    const tester = await createUser("tc-tester1@example.com");
    await addMember(project.id, tester.id, "TESTER");

    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const created = await (
      await createTestCaseRoute(
        jsonRequest(`http://test/api/test-groups/${testGroup.id}/test-cases`, "POST", {
          name: "Tester-restricted case",
          expectedResult: "Result",
          priority: "LOW",
          steps: [{ step: "Do the thing", expectedResult: "Thing happens" }],
        }),
        { params: Promise.resolve({ id: testGroup.id }) },
      )
    ).json();

    mockAuth.mockResolvedValue(sessionFor(tester.id) as never);
    const params = Promise.resolve({ id: created.id });

    const restrictedAttempt = await patchTestCase(
      jsonRequest(`http://test/api/test-cases/${created.id}`, "PATCH", {
        name: "Renamed by tester",
      }),
      { params },
    );
    expect(restrictedAttempt.status).toBe(400);

    const allowedAttempt = await patchTestCase(
      jsonRequest(`http://test/api/test-cases/${created.id}`, "PATCH", {
        testResult: "PASSED",
        notes: "Looks good",
      }),
      { params },
    );
    expect(allowedAttempt.status).toBe(200);
    const updated = await allowedAttempt.json();
    expect(updated.testResult).toBe("PASSED");
    expect(updated.notes).toBe("Looks good");
    expect(updated.updatedById).toBe(tester.id);
  });

  it("records updatedById and a fresh timestamp on every update", async () => {
    const { owner, testGroup } = await setup("tc-owner3@example.com", "PRJ-TC-3");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);

    const created = await (
      await createTestCaseRoute(
        jsonRequest(`http://test/api/test-groups/${testGroup.id}/test-cases`, "POST", {
          name: "Original",
          expectedResult: "Result",
          priority: "MEDIUM",
          steps: [{ step: "Step", expectedResult: "Expected" }],
        }),
        { params: Promise.resolve({ id: testGroup.id }) },
      )
    ).json();

    const updated = await (
      await patchTestCase(
        jsonRequest(`http://test/api/test-cases/${created.id}`, "PATCH", {
          name: "Updated",
          expectedResult: "Result",
          priority: "MEDIUM",
          steps: [{ step: "Step", expectedResult: "Expected" }],
        }),
        { params: Promise.resolve({ id: created.id }) },
      )
    ).json();

    expect(updated.updatedById).toBe(owner.id);
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(created.updatedAt).getTime(),
    );
  });

  it("duplicates, archives, restores, and deletes-with-confirm a test case", async () => {
    const { owner, testGroup } = await setup("tc-owner4@example.com", "PRJ-TC-4");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);

    const created = await (
      await createTestCaseRoute(
        jsonRequest(`http://test/api/test-groups/${testGroup.id}/test-cases`, "POST", {
          name: "Archivable case",
          expectedResult: "Result",
          priority: "LOW",
          steps: [{ step: "Step", expectedResult: "Expected" }],
        }),
        { params: Promise.resolve({ id: testGroup.id }) },
      )
    ).json();

    const duplicated = await (
      await duplicateTestCaseRoute(
        jsonRequest(`http://test/api/test-cases/${created.id}/duplicate`, "POST"),
        { params: Promise.resolve({ id: created.id }) },
      )
    ).json();
    expect(duplicated.id).not.toBe(created.id);
    expect(duplicated.testResult).toBe("NOT_RUN");

    const params = Promise.resolve({ id: created.id });
    await archiveTestCaseRoute(jsonRequest(`http://test/api/test-cases/${created.id}/archive`, "POST"), { params });
    const afterArchive = await (
      await listTestCases(jsonRequest(`http://test/api/test-groups/${testGroup.id}/test-cases`, "GET"), {
        params: Promise.resolve({ id: testGroup.id }),
      })
    ).json();
    expect(afterArchive.find((tc: { id: string }) => tc.id === created.id)).toBeUndefined();

    await restoreTestCaseRoute(jsonRequest(`http://test/api/test-cases/${created.id}/restore`, "POST"), { params });
    const afterRestore = await (
      await listTestCases(jsonRequest(`http://test/api/test-groups/${testGroup.id}/test-cases`, "GET"), {
        params: Promise.resolve({ id: testGroup.id }),
      })
    ).json();
    expect(afterRestore.find((tc: { id: string }) => tc.id === created.id)).toBeDefined();

    const deleteWithoutConfirm = await deleteTestCaseRoute(
      jsonRequest(`http://test/api/test-cases/${created.id}`, "DELETE", {}),
      { params },
    );
    expect(deleteWithoutConfirm.status).toBe(400);

    const deleteWithConfirm = await deleteTestCaseRoute(
      jsonRequest(`http://test/api/test-cases/${created.id}`, "DELETE", { confirm: true }),
      { params },
    );
    expect(deleteWithConfirm.status).toBe(200);
  });

  it("returns 403 for a non-member on every test case route", async () => {
    const { owner, testGroup } = await setup("tc-owner5@example.com", "PRJ-TC-5");
    const outsider = await createUser("tc-outsider1@example.com");

    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const created = await (
      await createTestCaseRoute(
        jsonRequest(`http://test/api/test-groups/${testGroup.id}/test-cases`, "POST", {
          name: "Restricted case",
          expectedResult: "Result",
          priority: "LOW",
          steps: [{ step: "Step", expectedResult: "Expected" }],
        }),
        { params: Promise.resolve({ id: testGroup.id }) },
      )
    ).json();

    mockAuth.mockResolvedValue(sessionFor(outsider.id) as never);
    const testGroupParams = Promise.resolve({ id: testGroup.id });
    const testCaseParams = Promise.resolve({ id: created.id });

    expect(
      (
        await createTestCaseRoute(
          jsonRequest(`http://test/api/test-groups/${testGroup.id}/test-cases`, "POST", {
            name: "x",
            expectedResult: "x",
            priority: "LOW",
            steps: [{ step: "x", expectedResult: "x" }],
          }),
          { params: testGroupParams },
        )
      ).status,
    ).toBe(403);

    expect(
      (await getTestCase(jsonRequest(`http://test/api/test-cases/${created.id}`, "GET"), { params: testCaseParams }))
        .status,
    ).toBe(403);

    expect(
      (
        await patchTestCase(jsonRequest(`http://test/api/test-cases/${created.id}`, "PATCH", { notes: "x" }), {
          params: testCaseParams,
        })
      ).status,
    ).toBe(403);

    expect(
      (
        await duplicateTestCaseRoute(jsonRequest(`http://test/api/test-cases/${created.id}/duplicate`, "POST"), {
          params: testCaseParams,
        })
      ).status,
    ).toBe(403);

    expect(
      (
        await archiveTestCaseRoute(jsonRequest(`http://test/api/test-cases/${created.id}/archive`, "POST"), {
          params: testCaseParams,
        })
      ).status,
    ).toBe(403);

    expect(
      (
        await restoreTestCaseRoute(jsonRequest(`http://test/api/test-cases/${created.id}/restore`, "POST"), {
          params: testCaseParams,
        })
      ).status,
    ).toBe(403);

    expect(
      (
        await deleteTestCaseRoute(
          jsonRequest(`http://test/api/test-cases/${created.id}`, "DELETE", { confirm: true }),
          { params: testCaseParams },
        )
      ).status,
    ).toBe(403);
  });

  it("restricts the assignee endpoint to ADMIN/QA_LEAD, rejecting a Tester", async () => {
    const { owner, project, testGroup } = await setup("tc-owner6@example.com", "PRJ-TC-6");
    const tester = await createUser("tc-tester2@example.com");
    await addMember(project.id, tester.id, "TESTER");

    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const created = await (
      await createTestCaseRoute(
        jsonRequest(`http://test/api/test-groups/${testGroup.id}/test-cases`, "POST", {
          name: "Assignable case",
          expectedResult: "Result",
          priority: "LOW",
          steps: [{ step: "Step", expectedResult: "Expected" }],
        }),
        { params: Promise.resolve({ id: testGroup.id }) },
      )
    ).json();
    const params = Promise.resolve({ id: created.id });

    mockAuth.mockResolvedValue(sessionFor(tester.id) as never);
    const testerAttempt = await patchAssigneeRoute(
      jsonRequest(`http://test/api/test-cases/${created.id}/assignee`, "PATCH", {
        assigneeId: tester.id,
      }),
      { params },
    );
    expect(testerAttempt.status).toBe(403);

    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const ownerAttempt = await patchAssigneeRoute(
      jsonRequest(`http://test/api/test-cases/${created.id}/assignee`, "PATCH", {
        assigneeId: tester.id,
      }),
      { params },
    );
    expect(ownerAttempt.status).toBe(200);
    const updated = await ownerAttempt.json();
    expect(updated.assigneeId).toBe(tester.id);
  });

  it("lets a Tester upload an attachment, listing it afterward", async () => {
    const { owner, project, testGroup } = await setup("tc-owner7@example.com", "PRJ-TC-7");
    const tester = await createUser("tc-tester3@example.com");
    await addMember(project.id, tester.id, "TESTER");

    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const created = await (
      await createTestCaseRoute(
        jsonRequest(`http://test/api/test-groups/${testGroup.id}/test-cases`, "POST", {
          name: "Case with evidence",
          expectedResult: "Result",
          priority: "LOW",
          steps: [{ step: "Step", expectedResult: "Expected" }],
        }),
        { params: Promise.resolve({ id: testGroup.id }) },
      )
    ).json();
    const params = Promise.resolve({ id: created.id });

    mockAuth.mockResolvedValue(sessionFor(tester.id) as never);
    const formData = new FormData();
    formData.append("file", new File(["evidence"], "screenshot.png", { type: "image/png" }));
    const uploadResponse = await uploadAttachmentRoute(
      new NextRequest(`http://test/api/test-cases/${created.id}/attachments`, {
        method: "POST",
        body: formData,
      }),
      { params },
    );
    expect(uploadResponse.status).toBe(201);

    const attachments = await (
      await listAttachmentsRoute(
        jsonRequest(`http://test/api/test-cases/${created.id}/attachments`, "GET"),
        { params },
      )
    ).json();
    expect(attachments).toHaveLength(1);
    expect(attachments[0].fileName).toBe("screenshot.png");
  });
});
