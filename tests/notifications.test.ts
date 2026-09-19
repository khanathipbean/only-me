import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createProject, archiveProject, restoreProject } from "@/lib/projects";
import { createModule, archiveModule, restoreModule } from "@/lib/modules";
import {
  createRequirement,
  archiveRequirement,
  restoreRequirement,
  findOrCreateUnassignedRequirement,
} from "@/lib/requirements";
import { createScenario, archiveScenario } from "@/lib/scenarios";
import { createTestGroup } from "@/lib/test-groups";
import { createTestCase } from "@/lib/test-cases";
import { createRun, addCasesToRun, setRunStatus, setRunCaseResult } from "@/lib/test-runs";
import { createUserWithAccess } from "@/lib/members";
import {
  notifyProject,
  listNotificationsForUser,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/notifications";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

// Real Supabase Storage needs credentials this test suite doesn't have — the
// upload-notification test only checks the notification row, never the bytes.
vi.mock("@/lib/storage", () => ({
  uploadFile: vi.fn(),
  downloadFile: vi.fn(),
  deleteFile: vi.fn(),
  MAX_UPLOAD_BYTES: 20 * 1024 * 1024,
}));

import { auth } from "@/auth";
import { POST as confirmImportRoute } from "@/app/api/projects/[id]/import/confirm/route";
import { saveProjectFile } from "@/lib/project-files";

const mockAuth = vi.mocked(auth);

function sessionFor(userId: string) {
  return {
    user: { id: userId, email: `${userId}@example.com` },
    expires: new Date(Date.now() + 86_400_000).toISOString(),
  };
}

function jsonRequest(url: string, method: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  });
}

async function createUser(email: string) {
  return prisma.user.create({ data: { email, passwordHash: "irrelevant", name: email } });
}

/** A project with a second member besides the owner — every trigger notifies
 *  "the project" minus whoever acted, so a fan-out test needs someone left to
 *  receive it. */
async function seedProject(code: string) {
  const owner = await createUser(`${code}-owner@example.com`);
  const other = await createUser(`${code}-other@example.com`);
  const project = await createProject({ code, name: `Project ${code}`, status: "DRAFT" }, owner.id);
  await prisma.projectMember.create({ data: { projectId: project.id, userId: other.id, role: "ADMIN" } });
  return { owner, other, project };
}

describe("notifications", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("fans out to every project member except the excluded user", async () => {
    const { owner, other, project } = await seedProject("PRJ-NOTIF-1");

    await notifyProject({
      projectId: project.id,
      type: "FILE_UPLOADED",
      title: "Test",
      body: "Body",
      actorId: owner.id,
      excludeUserId: owner.id,
    });

    const forOther = await prisma.notification.findMany({ where: { recipientId: other.id } });
    expect(forOther).toHaveLength(1);
    expect(forOther[0].projectId).toBe(project.id);

    const forOwner = await prisma.notification.findMany({ where: { recipientId: owner.id } });
    expect(forOwner).toHaveLength(0);
  });

  it("tracks unread count and scopes mark-read to the recipient", async () => {
    const { owner, other, project } = await seedProject("PRJ-NOTIF-2");

    await notifyProject({
      projectId: project.id,
      type: "FILE_UPLOADED",
      title: "A",
      body: "A",
      actorId: owner.id,
    });
    // No excludeUserId this time: both members get one, so there's a
    // notification belonging to `owner` for the mis-scoped mark-read below.
    expect(await countUnreadNotifications(owner.id)).toBe(1);
    expect(await countUnreadNotifications(other.id)).toBe(1);

    const ownerNotification = (await listNotificationsForUser(owner.id, {})).items[0];

    // `other` trying to mark `owner`'s notification read must be a no-op.
    await markNotificationRead(ownerNotification.id, other.id);
    expect(await countUnreadNotifications(owner.id)).toBe(1);

    await markNotificationRead(ownerNotification.id, owner.id);
    expect(await countUnreadNotifications(owner.id)).toBe(0);

    await markAllNotificationsRead(other.id);
    expect(await countUnreadNotifications(other.id)).toBe(0);
  });

  it("notifies on file upload, naming the file and module", async () => {
    const { owner, other, project } = await seedProject("PRJ-NOTIF-3");
    const mod = await createModule(project.id, "Policy", owner.id);

    const file = new File(["hello"], "report.pdf", { type: "application/pdf" });
    await saveProjectFile(project.id, mod.id, file, owner.id);

    const notifications = await prisma.notification.findMany({ where: { recipientId: other.id } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe("FILE_UPLOADED");
    expect(notifications[0].body).toContain("report.pdf");
    expect(notifications[0].body).toContain("Policy");
  });

  it("notifies on Test Run close with the right pass/fail count, and on each failure while it's open", async () => {
    const { owner, other, project } = await seedProject("PRJ-NOTIF-4");
    const requirementId = await findOrCreateUnassignedRequirement(project.id, owner.id);
    const scenario = await createScenario(
      project.id,
      { name: "Scenario", requirementId, expectedResult: "ok", priority: "MEDIUM" },
      owner.id,
    );
    const group = await createTestGroup(scenario.id, { name: "Group" }, owner.id);
    const caseA = await createTestCase(
      group.id,
      { name: "Case A", expectedResult: "ok", priority: "MEDIUM", steps: [{ step: "s", expectedResult: "r" }] },
      owner.id,
    );
    const caseB = await createTestCase(
      group.id,
      { name: "Case B", expectedResult: "ok", priority: "MEDIUM", steps: [{ step: "s", expectedResult: "r" }] },
      owner.id,
    );

    const run = await createRun(project.id, { name: "Regression" }, owner.id);
    await addCasesToRun(run.id, [caseA.id, caseB.id], owner.id);

    await setRunCaseResult(run.id, caseA.id, { testResult: "PASSED" }, owner.id);
    // The failure notification fires immediately, while the run is still open.
    await setRunCaseResult(run.id, caseB.id, { testResult: "FAILED" }, owner.id);

    const failureNotifications = await prisma.notification.findMany({
      where: { recipientId: other.id, type: "TEST_CASE_FAILED" },
    });
    expect(failureNotifications).toHaveLength(1);
    expect(failureNotifications[0].body).toContain("Case B");

    await setRunStatus(run.id, "CLOSED", owner.id);

    const closeNotifications = await prisma.notification.findMany({
      where: { recipientId: other.id, type: "TEST_RUN_CLOSED" },
    });
    expect(closeNotifications).toHaveLength(1);
    expect(closeNotifications[0].body).toBe("1 of 2 test cases passed (50%).");
  });

  it("notifies on archive/restore of Project, Module, and Requirement — but not Scenario", async () => {
    const { owner, other, project } = await seedProject("PRJ-NOTIF-5");
    const mod = await createModule(project.id, "Governance", owner.id);
    const requirement = await createRequirement(
      project.id,
      { name: "Req", moduleId: mod.id, priority: "MEDIUM" },
      owner.id,
    );
    const requirementIdForScenario = await findOrCreateUnassignedRequirement(project.id, owner.id);
    const scenario = await createScenario(
      project.id,
      { name: "Scenario", requirementId: requirementIdForScenario, expectedResult: "ok", priority: "MEDIUM" },
      owner.id,
    );

    // The Requirement archives first: a Module refuses to archive while an
    // active Requirement still points at it (assertModuleNotInUse).
    await archiveRequirement(requirement.id, owner.id);
    await archiveModule(mod.id, owner.id);
    await restoreModule(mod.id, owner.id);
    await restoreRequirement(requirement.id, owner.id);
    await archiveProject(project.id, owner.id);
    await restoreProject(project.id, owner.id);
    await archiveScenario(scenario.id, owner.id);

    const archived = await prisma.notification.findMany({
      where: { recipientId: other.id, type: "ENTITY_ARCHIVED" },
      orderBy: { occurredAt: "asc" },
    });
    // 2 (module) + 2 (requirement) + 2 (project) = 6 — the Scenario archive
    // does not add a 7th, since only Project/Module/Requirement are wired.
    expect(archived).toHaveLength(6);
  });

  it("notifies existing members when someone new is added to the project", async () => {
    const { owner, other, project } = await seedProject("PRJ-NOTIF-6");

    await createUserWithAccess(
      [{ projectId: project.id, role: "TESTER" }],
      { email: "newbie@example.com", name: "Newbie", password: "password123" },
      owner.id,
    );

    const notifications = await prisma.notification.findMany({
      where: { recipientId: other.id, type: "MEMBER_ADDED" },
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].body).toContain("Newbie");
    expect(notifications[0].body).toContain("Tester");
  });

  it("notifies on a completed import, naming what it created", async () => {
    const { owner, other, project } = await seedProject("PRJ-NOTIF-7");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);

    await confirmImportRoute(
      jsonRequest(`http://test/api/projects/${project.id}/import/confirm`, "POST", {
        rows: [
          {
            rowNumber: 1,
            data: {
              rowNumber: 1,
              projectCode: "PRJ-NOTIF-7",
              scenarioName: "Login Flow",
              testGroupName: "Functional",
              testCaseName: "Valid login",
              preconditions: "",
              testSteps: "Enter credentials",
              expectedResult: "User reaches dashboard",
              priority: "HIGH",
            },
          },
        ],
      }),
      { params: Promise.resolve({ id: project.id }) },
    );

    const notifications = await prisma.notification.findMany({
      where: { recipientId: other.id, type: "IMPORT_COMPLETED" },
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].body).toContain("scenario");
    expect(notifications[0].body).toContain("test group");
    expect(notifications[0].body).toContain("test case");
  });
});
