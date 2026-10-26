import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { listUserAuditLog } from "@/lib/audit-log";
import { describeAccountEvent } from "@/lib/account-activity";
import { setPasswordForUser, unlockUserAccount } from "@/lib/users";
import { createUserWithAccess, deleteUser, updateUserProjectAccess } from "@/lib/members";
import { MAX_FAILURES, readLockState, recordFailure } from "@/lib/login-throttle";
import { createUser, uniqueCode, uniqueEmail } from "./support/fixtures";

/**
 * Three things happen to an account rather than inside a project: an
 * administrator sets somebody's password, unlocks them, or deletes them. None
 * of the three was recorded anywhere, because every audit entry needed a
 * project and none of these has one — so the log answered every question
 * except the one about itself: who changed my password.
 */
describe("what is recorded about an account", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  async function entriesFor(subjectId: string) {
    const { entries } = await listUserAuditLog({ pageSize: 100 });
    return entries.filter((entry) => entry.entityId === subjectId);
  }

  /* By the account the entry turned out to be about, rather than by the id it
     happens to store — a membership entry names a row in a join table, and
     working out whose it was is the thing being tested. */
  async function aboutAccount(subjectId: string) {
    const { entries } = await listUserAuditLog({ pageSize: 200 });
    return entries.filter(
      (entry) => entry.subject?.id === subjectId || entry.entityId === subjectId,
    );
  }

  /* With its owner on it as ADMIN, because `updateUserProjectAccess` refuses
     any change that would leave the whole system without one — and a
     throwaway database starts with none at all. */
  async function makeProject(ownerId: string, name = "Audit host") {
    const project = await prisma.project.create({
      data: { code: uniqueCode("prj-audit"), name, ownerId },
    });
    await prisma.projectMember.create({
      data: { projectId: project.id, userId: ownerId, role: "ADMIN" },
    });
    return project;
  }

  it("records who set somebody's password, and never the password", async () => {
    const admin = await createUser(uniqueEmail("audit-admin"));
    const target = await createUser(uniqueEmail("audit-target"));

    await setPasswordForUser(target.id, "a-long-enough-one", admin.id);

    const [entry] = await entriesFor(target.id);
    expect(entry).toMatchObject({ entityType: "User", action: "set-password" });
    expect(entry.actor?.id).toBe(admin.id);
    expect(entry.projectId).toBeNull();

    // The point of the entry is what happened and who did it. The password
    // itself must be nowhere near it.
    expect(JSON.stringify(entry)).not.toContain("a-long-enough-one");
  });

  it("records an unlock, and really unlocks", async () => {
    const admin = await createUser(uniqueEmail("audit-admin"));
    const target = await createUser(uniqueEmail("audit-locked"));

    for (let attempt = 0; attempt < MAX_FAILURES; attempt += 1) {
      await recordFailure(target.email);
    }
    expect((await readLockState(target.email)).locked).toBe(true);

    await unlockUserAccount(target.id, admin.id);

    expect((await readLockState(target.email)).locked).toBe(false);
    const [entry] = await entriesFor(target.id);
    expect(entry).toMatchObject({ action: "unlock", projectId: null });
    expect(entry.actor?.id).toBe(admin.id);
  });

  it("records a deleted account, which is the entry most likely to be needed", async () => {
    const admin = await createUser(uniqueEmail("audit-admin"));
    const target = await createUser(uniqueEmail("audit-doomed"));

    await deleteUser(target.id, admin.id);

    const [entry] = await entriesFor(target.id);
    expect(entry).toMatchObject({ action: "delete", projectId: null });
    /* The account is gone, so the entry cannot be joined to it — the reader
     * looks the name up separately and is allowed to find nothing. */
    expect(entry.subject).toBeNull();
    expect(entry.actor?.id).toBe(admin.id);
  });

  it("keeps project entries out of the account list", async () => {
    const admin = await createUser(uniqueEmail("audit-admin"));
    const project = await prisma.project.create({
      data: {
        code: `AUDIT-${Date.now().toString(36)}`,
        name: "Audit scope",
        status: "ACTIVE",
        ownerId: admin.id,
      },
    });
    await prisma.auditLog.create({
      data: {
        entityType: "Module",
        entityId: "some-module",
        action: "create",
        actorId: admin.id,
        projectId: project.id,
      },
    });

    const { entries } = await listUserAuditLog({ pageSize: 100 });
    /* Filtered on entityType, so a project's own history never leaks in here
       however its projectId behaves — and the list now carries membership
       entries, which are about an account even though they name a Project.
       A Module is not, and must stay out. */
    expect(
      entries.every((entry) => ["User", "ProjectMember"].includes(entry.entityType)),
    ).toBe(true);
    expect(entries.some((entry) => entry.entityId === "some-module")).toBe(false);
  });
  it("records an account being made, not only one being destroyed", async () => {
    /* Deleting an account has been recorded since accounts had a log at all.
       Creating one never was, so the single question about an account the log
       could not answer was when it appeared and who made it. */
    const admin = await createUser(uniqueEmail("audit-admin"));
    const project = await makeProject(admin.id);

    const created = await createUserWithAccess(
      [{ projectId: project.id, role: "TESTER" }],
      { name: "Made Here", email: uniqueEmail("audit-made"), password: "a-long-enough-one" },
      admin.id,
    );

    const [entry] = await entriesFor(created.userId);
    expect(entry).toMatchObject({ entityType: "User", action: "create", projectId: null });
    expect(entry.actor?.id).toBe(admin.id);
    expect(JSON.stringify(entry)).not.toContain("a-long-enough-one");
  });

  it("shows what an account was given access to and where its role moved", async () => {
    /* These were recorded all along, against the Project — so the Users page
       showed nothing for an account somebody had just made and given access
       to, and the question it exists to answer went unanswered. */
    const admin = await createUser(uniqueEmail("audit-admin"));
    const project = await makeProject(admin.id, "Audit host PROM");

    const created = await createUserWithAccess(
      [{ projectId: project.id, role: "TESTER" }],
      { name: "Moved About", email: uniqueEmail("audit-moved"), password: "a-long-enough-one" },
      admin.id,
    );
    await updateUserProjectAccess(
      created.userId,
      [{ projectId: project.id, role: "QA_LEAD" }],
      admin.id,
    );

    const entries = await aboutAccount(created.userId);
    expect(entries.map((entry) => `${entry.entityType}:${entry.action}`)).toEqual([
      "ProjectMember:update",
      "ProjectMember:create",
      "User:create",
    ]);
    // And each membership entry says which Project, or it is a fact about
    // nothing in particular.
    const roleChange = entries.find((entry) => entry.action === "update")!;
    expect(roleChange.project?.name).toBe("Audit host PROM");
    expect(roleChange.subject?.id).toBe(created.userId);
  });

  it("still names the account whose role changed once the access is gone", async () => {
    /* The entry points at a membership row, and taking the access away
       removes it. Reading the account back out of the row would lose exactly
       the history somebody comes here for. */
    const admin = await createUser(uniqueEmail("audit-admin"));
    const project = await makeProject(admin.id);

    const created = await createUserWithAccess(
      [{ projectId: project.id, role: "TESTER" }],
      { name: "Then Removed", email: uniqueEmail("audit-removed"), password: "a-long-enough-one" },
      admin.id,
    );
    await updateUserProjectAccess(
      created.userId,
      [{ projectId: project.id, role: "QA_LEAD" }],
      admin.id,
    );
    await updateUserProjectAccess(created.userId, [], admin.id);

    const entries = await aboutAccount(created.userId);
    const roleChange = entries.find((entry) => entry.action === "update")!;
    expect(roleChange.subject?.id).toBe(created.userId);
    expect(entries.some((entry) => entry.action === "delete")).toBe(true);
  });
});

describe("how an account's activity reads", () => {
  const project = { name: "PROM" };

  it("tells the two kinds of 'delete' apart", () => {
    /* The same stored word means an account destroyed and a Project access
       taken away. Only the entity beside it says which. */
    expect(
      describeAccountEvent({
        entityType: "User",
        action: "delete",
        oldValue: null,
        newValue: null,
        project: null,
      }),
    ).toBe("Account deleted");
    expect(
      describeAccountEvent({
        entityType: "ProjectMember",
        action: "delete",
        oldValue: { userId: "u1", role: "TESTER" },
        newValue: null,
        project,
      }),
    ).toBe("Removed from PROM");
  });

  it("names the Project and both roles on a change", () => {
    expect(
      describeAccountEvent({
        entityType: "ProjectMember",
        action: "update",
        oldValue: { userId: "u1", role: "TESTER" },
        newValue: { userId: "u1", role: "QA_LEAD" },
        project,
      }),
    ).toBe("Role in PROM changed from Tester to QA Lead");
  });

  it("says what access was granted, and survives the values being thin", () => {
    expect(
      describeAccountEvent({
        entityType: "ProjectMember",
        action: "create",
        oldValue: null,
        newValue: { userId: "u1", role: "DEV" },
        project,
      }),
    ).toBe("Added to PROM as Dev");
    /* Entries written before the role was recorded, and entries whose
       Project has since gone: both still happened, so both still read. */
    expect(
      describeAccountEvent({
        entityType: "ProjectMember",
        action: "create",
        oldValue: null,
        newValue: null,
        project: null,
      }),
    ).toBe("Added to a deleted Project");
  });

  it("falls back to the stored word rather than printing nothing", () => {
    expect(
      describeAccountEvent({
        entityType: "User",
        action: "something-new",
        oldValue: null,
        newValue: null,
        project: null,
      }),
    ).toBe("something-new");
  });
});
