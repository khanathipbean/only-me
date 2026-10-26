import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { FixedCapabilityError, setRolePermissions } from "@/lib/role-permissions";
import {
  CAPABILITIES,
  defaultRolesFor,
  rolesFor,
  type CapabilityKey,
} from "@/lib/permissions";
import type { ProjectRole } from "@/generated/prisma/client";
import { createUser, uniqueEmail } from "./support/fixtures";

/**
 * Changing what a role may do.
 *
 * The table holds only what differs from the code, so most of what is worth
 * testing is what it does *not* write — and the one thing it refuses.
 */
describe("editing a role's permissions", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    await prisma.rolePermission.deleteMany({});
    /* And the entries the last test left, since one of these counts them. */
    await prisma.auditLog.deleteMany({ where: { entityType: "RolePermission" } });
  });

  /** Every key a role holds today — the whole set, because the form submits
   *  the whole set and anything left out is a tick taken away. */
  function defaultsFor(role: ProjectRole) {
    return CAPABILITIES.filter((capability) =>
      defaultRolesFor(capability.key as CapabilityKey).includes(role),
    ).map((capability) => capability.key);
  }

  it("writes nothing when the ticks match the code", async () => {
    const admin = await createUser(uniqueEmail("perm-admin"));
    const moved = await setRolePermissions("TESTER", defaultsFor("TESTER"), admin.id);
    expect(moved).toBe(0);
    expect(await prisma.rolePermission.count()).toBe(0);
  });

  it("takes a capability away, and the guard follows", async () => {
    const admin = await createUser(uniqueEmail("perm-admin"));
    expect(await rolesFor("notes.write")).toContain("TESTER");

    const ticked = defaultsFor("TESTER").filter((key) => key !== "notes.write");
    expect(await setRolePermissions("TESTER", ticked, admin.id)).toBe(1);

    expect(await rolesFor("notes.write")).not.toContain("TESTER");
    // And the rest of the role is untouched.
    expect(await rolesFor("authoring.edit")).toContain("TESTER");
  });

  it("gives one to a role that never had it", async () => {
    const admin = await createUser(uniqueEmail("perm-admin"));
    expect(await rolesFor("authoring.edit")).not.toContain("DEV");

    await setRolePermissions("DEV", [...defaultsFor("DEV"), "authoring.edit"], admin.id);
    expect(await rolesFor("authoring.edit")).toContain("DEV");
  });

  it("forgets the row again when it is set back", async () => {
    const admin = await createUser(uniqueEmail("perm-admin"));
    const ticked = defaultsFor("TESTER").filter((key) => key !== "notes.write");
    await setRolePermissions("TESTER", ticked, admin.id);
    expect(await prisma.rolePermission.count()).toBe(1);

    await setRolePermissions("TESTER", defaultsFor("TESTER"), admin.id);
    /* Not stored as "the same as the code" — deleted, so the table stays a
       list of decisions somebody made. */
    expect(await prisma.rolePermission.count()).toBe(0);
  });

  it("refuses to take away the way back into Settings", async () => {
    const admin = await createUser(uniqueEmail("perm-admin"));
    /* ADMIN holds install.users by default; submitting without it is an
       attempt to take it away, and that is the one thing this cannot do. */
    await expect(
      setRolePermissions("ADMIN", ["install.settings"], admin.id),
    ).rejects.toBeInstanceOf(FixedCapabilityError);
    expect(await prisma.rolePermission.count()).toBe(0);
    expect(await rolesFor("install.users")).toEqual(["ADMIN"]);
  });

  it("refuses to hand it to somebody else either", async () => {
    const admin = await createUser(uniqueEmail("perm-admin"));
    await expect(
      setRolePermissions("DEV", ["install.users"], admin.id),
    ).rejects.toBeInstanceOf(FixedCapabilityError);
  });

  it("records what moved, and nothing when nothing did", async () => {
    const admin = await createUser(uniqueEmail("perm-admin"));
    await setRolePermissions("TESTER", defaultsFor("TESTER"), admin.id);
    expect(await prisma.auditLog.count({ where: { entityType: "RolePermission" } })).toBe(0);

    await setRolePermissions(
      "TESTER",
      defaultsFor("TESTER").filter((key) => key !== "runs.manage"),
      admin.id,
    );
    const entry = await prisma.auditLog.findFirst({
      where: { entityType: "RolePermission", entityId: "TESTER" },
    });
    expect(entry?.action).toBe("update");
    expect(JSON.stringify(entry?.newValue)).toContain("runs.manage");
  });
});
