import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";
import { POST as createProjectRoute } from "@/app/api/projects/route";
import { POST as createScenarioRoute } from "@/app/api/projects/[id]/scenarios/route";
import { createModule } from "@/lib/modules";
import {
  ConfirmRequiredError,
  RequirementValidationError,
  archiveRequirement,
  createRequirement,
  deleteRequirement,
  restoreRequirement,
  updateRequirement,
} from "@/lib/requirements";

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
      jsonRequest("http://test/api/projects", "POST", { code, name: `Project ${code}`, status: "DRAFT" }),
    )
  ).json();
  const testModule = await createModule(project.id, "Checkout", owner.id);
  return { owner, project, testModule };
}

describe("requirements", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("deletes a Requirement, requiring confirm: true, and records it in the audit log", async () => {
    const { owner, project, testModule } = await setup("requirement-owner1@example.com", "PRJ-REQ-1");
    const requirement = await createRequirement(
      project.id,
      { name: "Req A", moduleId: testModule.id, priority: "MEDIUM" },
      owner.id,
    );

    await expect(deleteRequirement(requirement.id, owner.id, false)).rejects.toThrow(
      ConfirmRequiredError,
    );

    await deleteRequirement(requirement.id, owner.id, true);

    // Gone, not hidden: delete used to be the same soft delete as archive.
    expect(await prisma.requirement.findUnique({ where: { id: requirement.id } })).toBeNull();

    // The audit entry outlives the row, and carries what was there.
    const logs = await prisma.auditLog.findMany({
      where: { entityId: requirement.id, action: "delete" },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].oldValue).toMatchObject({ name: "Req A" });
  });

  it("takes a Requirement's Scenarios with it", async () => {
    const { owner, project, testModule } = await setup("requirement-owner2@example.com", "PRJ-REQ-2");
    const requirement = await createRequirement(
      project.id,
      { name: "Req A", moduleId: testModule.id, priority: "MEDIUM" },
      owner.id,
    );
    await createScenarioRoute(
      jsonRequest(`http://test/api/projects/${project.id}/scenarios`, "POST", {
        requirementId: requirement.id,
        name: "Scenario A",
        expectedResult: "Result",
        priority: "MEDIUM",
      }),
      { params: Promise.resolve({ id: project.id }) },
    );

    const scenarios = await prisma.scenario.findMany({ where: { requirementId: requirement.id } });
    expect(scenarios).toHaveLength(1);

    // Archive is the one that refuses while children are live; delete is the
    // one that means it.
    await deleteRequirement(requirement.id, owner.id, true);

    expect(await prisma.requirement.findUnique({ where: { id: requirement.id } })).toBeNull();
    expect(await prisma.scenario.findUnique({ where: { id: scenarios[0].id } })).toBeNull();
  });

  it("restores an archived Requirement", async () => {
    const { owner, project, testModule } = await setup("requirement-owner3@example.com", "PRJ-REQ-3");
    const requirement = await createRequirement(
      project.id,
      { name: "Req A", moduleId: testModule.id, priority: "MEDIUM" },
      owner.id,
    );
    await archiveRequirement(requirement.id, owner.id);

    const restored = await restoreRequirement(requirement.id, owner.id);
    expect(restored.deletedAt).toBeNull();
  });

  it("still refuses to archive a Requirement in use, unaffected by adding delete", async () => {
    const { owner, project, testModule } = await setup("requirement-owner4@example.com", "PRJ-REQ-4");
    const requirement = await createRequirement(
      project.id,
      { name: "Req A", moduleId: testModule.id, priority: "MEDIUM" },
      owner.id,
    );
    await createScenarioRoute(
      jsonRequest(`http://test/api/projects/${project.id}/scenarios`, "POST", {
        requirementId: requirement.id,
        name: "Scenario A",
        expectedResult: "Result",
        priority: "MEDIUM",
      }),
      { params: Promise.resolve({ id: project.id }) },
    );

    await expect(archiveRequirement(requirement.id, owner.id)).rejects.toThrow(
      RequirementValidationError,
    );
  });

  it("refuses to re-file a Requirement under another project's Module", async () => {
    const { owner, project, testModule } = await setup("requirement-owner9@example.com", "PRJ-REQ-9");
    const elsewhere = await setup("requirement-owner10@example.com", "PRJ-REQ-10");

    const requirement = await createRequirement(
      project.id,
      { name: "Req in project 9", moduleId: testModule.id, priority: "MEDIUM" },
      owner.id,
    );

    // The picker only ever offers this project's Modules, but the id arrives
    // in a form field and a form field is whatever the request says it is.
    await expect(
      updateRequirement(
        requirement.id,
        { name: "Req in project 9", moduleId: elsewhere.testModule.id, priority: "MEDIUM" },
        owner.id,
      ),
    ).rejects.toThrow(RequirementValidationError);

    const after = await prisma.requirement.findUniqueOrThrow({ where: { id: requirement.id } });
    expect(after.moduleId).toBe(testModule.id);
    expect(after.projectId).toBe(project.id);
  });
});
