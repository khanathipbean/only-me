import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { listUserAuditLog } from "@/lib/audit-log";
import { setPasswordForUser, unlockUserAccount } from "@/lib/users";
import { deleteUser } from "@/lib/members";
import { MAX_FAILURES, readLockState, recordFailure } from "@/lib/login-throttle";
import { createUser, uniqueEmail } from "./support/fixtures";

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
    // Filtered on entityType, so a project's own history never leaks in here
    // however its projectId behaves.
    expect(entries.every((entry) => entry.entityType === "User")).toBe(true);
    expect(entries.some((entry) => entry.entityId === "some-module")).toBe(false);
  });
});
