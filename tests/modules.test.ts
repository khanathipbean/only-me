import { beforeEach, describe, expect, it, vi } from "vitest";
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
import { createUser, jsonRequest, sessionFor, uniqueCode, uniqueEmail } from "./support/fixtures";

const mockAuth = vi.mocked(auth);

/* Takes no names: every test here wanted a project and an owner, not a
 * particular project and a particular owner, and the numbers they were
 * spelling out by hand were only ever there to keep two tests apart. */
async function setup() {
  const code = uniqueCode("prj-mod");
  const owner = await createUser(uniqueEmail("module-owner"));
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
    const { owner, project } = await setup();
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
    const { owner, project } = await setup();
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
    const { owner, project } = await setup();
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
    const { owner, project } = await setup();
    const testModule = await createModule(project.id, "Checkout", owner.id);
    await archiveModule(testModule.id, owner.id);

    const restored = await restoreModule(testModule.id, owner.id);
    expect(restored.deletedAt).toBeNull();
  });

  it("still refuses to archive a Module in use, unaffected by adding delete", async () => {
    const { owner, project } = await setup();
    const testModule = await createModule(project.id, "Checkout", owner.id);
    await createRequirement(
      project.id,
      { name: "Req A", moduleId: testModule.id, priority: "MEDIUM" },
      owner.id,
    );

    await expect(archiveModule(testModule.id, owner.id)).rejects.toThrow(ModuleValidationError);
  });
});
