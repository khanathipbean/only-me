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

  it("deletes a Module, requiring confirm: true, and records it in the audit log", async () => {
    const { owner, project } = await setup("module-owner1@example.com", "PRJ-MOD-1");
    const testModule = await createModule(project.id, "Checkout", owner.id);

    await expect(deleteModule(testModule.id, owner.id, false)).rejects.toThrow(ConfirmRequiredError);

    const deleted = await deleteModule(testModule.id, owner.id, true);
    expect(deleted.deletedAt).not.toBeNull();

    const logs = await prisma.auditLog.findMany({ where: { entityId: testModule.id, action: "delete" } });
    expect(logs).toHaveLength(1);
  });

  it("refuses to delete a Module that still carries a live Requirement", async () => {
    const { owner, project } = await setup("module-owner2@example.com", "PRJ-MOD-2");
    const testModule = await createModule(project.id, "Checkout", owner.id);
    await createRequirement(
      project.id,
      { name: "Req A", moduleId: testModule.id, priority: "MEDIUM" },
      owner.id,
    );

    await expect(deleteModule(testModule.id, owner.id, true)).rejects.toThrow(ModuleValidationError);
  });

  it("restores a deleted Module", async () => {
    const { owner, project } = await setup("module-owner3@example.com", "PRJ-MOD-3");
    const testModule = await createModule(project.id, "Checkout", owner.id);
    await deleteModule(testModule.id, owner.id, true);

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
