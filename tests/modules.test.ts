import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";
import { POST as createProjectRoute } from "@/app/api/projects/route";
import {
  ConfirmRequiredError,
  ModuleValidationError,
  archiveModule,
  createModule,
  deleteModule,
  restoreModule,
} from "@/lib/modules";
import { createRequirement } from "@/lib/requirements";

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
  return { owner, project };
}

describe("modules", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("deletes a Module for real, requiring confirm: true, and leaves the audit entry", async () => {
    const { owner, project } = await setup("module-owner1@example.com", "PRJ-MOD-1");
    const testModule = await createModule(project.id, "Checkout", owner.id);

    await expect(deleteModule(testModule.id, owner.id, false)).rejects.toThrow(ConfirmRequiredError);

    await deleteModule(testModule.id, owner.id, true);

    // Gone, not hidden. Delete used to set `deletedAt` exactly as archive
    // does, so the row came back under the Archived filter with a Restore
    // button beside a confirmation that said it could not be undone.
    expect(await prisma.module.findUnique({ where: { id: testModule.id } })).toBeNull();

    // The audit entry outlives the row: `entityId` is a plain string with no
    // foreign key, and it is the only record left that the Module existed.
    const logs = await prisma.auditLog.findMany({
      where: { entityId: testModule.id, action: "delete" },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].oldValue).toMatchObject({ name: "Checkout" });
  });

  it("takes a Module's whole subtree with it", async () => {
    const { owner, project } = await setup("module-owner2@example.com", "PRJ-MOD-2");
    const testModule = await createModule(project.id, "Checkout", owner.id);
    const requirement = await createRequirement(
      project.id,
      { name: "Req A", moduleId: testModule.id, priority: "MEDIUM" },
      owner.id,
    );

    await deleteModule(testModule.id, owner.id, true);

    expect(await prisma.module.findUnique({ where: { id: testModule.id } })).toBeNull();
    expect(await prisma.requirement.findUnique({ where: { id: requirement.id } })).toBeNull();
  });

  it("refuses to delete a Module that still holds files", async () => {
    const { owner, project } = await setup("module-owner3@example.com", "PRJ-MOD-3");
    const testModule = await createModule(project.id, "Checkout", owner.id);

    // A file filed under a Module is not a descendant of it: deleting the
    // shelf is no reason to burn the document.
    await prisma.projectFile.create({
      data: {
        projectId: project.id,
        moduleId: testModule.id,
        module: "Checkout",
        fileName: "spec.pdf",
        storageKey: `project-files/${testModule.id}`,
        contentType: "application/pdf",
        size: 10,
        uploadedById: owner.id,
      },
    });

    await expect(deleteModule(testModule.id, owner.id, true)).rejects.toThrow(ModuleValidationError);
    expect(await prisma.module.findUnique({ where: { id: testModule.id } })).not.toBeNull();
  });

  it("restores an archived Module", async () => {
    const { owner, project } = await setup("module-owner3b@example.com", "PRJ-MOD-3B");
    const testModule = await createModule(project.id, "Checkout", owner.id);
    await archiveModule(testModule.id, owner.id);

    const restored = await restoreModule(testModule.id, owner.id);
    expect(restored.deletedAt).toBeNull();
  });

  it("still refuses to archive a Module in use, unaffected by adding delete", async () => {
    const { owner, project } = await setup("module-owner4@example.com", "PRJ-MOD-4");
    const testModule = await createModule(project.id, "Checkout", owner.id);
    await createRequirement(
      project.id,
      { name: "Req A", moduleId: testModule.id, priority: "MEDIUM" },
      owner.id,
    );

    await expect(archiveModule(testModule.id, owner.id)).rejects.toThrow(ModuleValidationError);
  });
});
