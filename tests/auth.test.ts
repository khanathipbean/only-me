import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { authenticateWithPassword, hashPassword } from "@/lib/auth-credentials";
import { isAuthorized } from "@/auth.config";

describe("authenticateWithPassword", () => {
  beforeAll(async () => {
    await prisma.user.create({
      data: {
        email: "qa-lead@example.com",
        passwordHash: await hashPassword("correct-horse-battery-staple"),
        name: "QA Lead",
      },
    });
  });

  it("returns the user for a valid email and password", async () => {
    const user = await authenticateWithPassword({
      email: "qa-lead@example.com",
      password: "correct-horse-battery-staple",
    });

    expect(user).not.toBeNull();
    expect(user?.email).toBe("qa-lead@example.com");
  });

  it("returns null for a wrong password", async () => {
    const user = await authenticateWithPassword({
      email: "qa-lead@example.com",
      password: "wrong-password",
    });

    expect(user).toBeNull();
  });

  it("returns null for an unknown email", async () => {
    const user = await authenticateWithPassword({
      email: "nobody@example.com",
      password: "anything",
    });

    expect(user).toBeNull();
  });
});

describe("isAuthorized", () => {
  it("is false when there is no session", () => {
    expect(isAuthorized(null)).toBe(false);
  });

  it("is false when the session has no user", () => {
    expect(isAuthorized({ user: undefined })).toBe(false);
  });

  it("is true when the session has a user", () => {
    expect(isAuthorized({ user: { id: "u1", email: "a@b.com" } })).toBe(true);
  });
});

/**
 * The hole this closes: `/forgot-password` sat outside authentication and
 * took an email address and a new password, so anyone who knew an address
 * owned that account. There is nothing left that changes a password without
 * either the old one or an administrator.
 */
describe("who can change a password", () => {
  it("offers nothing that takes an email address and a new password", async () => {
    const users = await import("@/lib/users");
    expect("resetPasswordByEmail" in users).toBe(false);
  });

  it("sets a password for a user, which replaces the old one", async () => {
    const { setPasswordForUser } = await import("@/lib/users");
    const user = await prisma.user.create({
      data: {
        email: "locked-out@example.com",
        passwordHash: await hashPassword("the-old-one"),
        name: "Locked Out",
      },
    });

    await setPasswordForUser(user.id, "a-brand-new-one");

    expect(
      await authenticateWithPassword({
        email: "locked-out@example.com",
        password: "a-brand-new-one",
      }),
    ).toMatchObject({ id: user.id });
    // And the old one stops working, or nothing was really replaced.
    expect(
      await authenticateWithPassword({
        email: "locked-out@example.com",
        password: "the-old-one",
      }),
    ).toBeNull();
  });

  it("refuses a password too short to be worth setting", async () => {
    const { setPasswordForUser, ProfileValidationError } = await import("@/lib/users");
    const user = await prisma.user.create({
      data: {
        email: "short-password@example.com",
        passwordHash: await hashPassword("the-old-one"),
        name: "Short",
      },
    });

    await expect(setPasswordForUser(user.id, "short")).rejects.toBeInstanceOf(
      ProfileValidationError,
    );
  });

  it("refuses a user who is no longer there", async () => {
    const { setPasswordForUser, ProfileValidationError } = await import("@/lib/users");
    await expect(setPasswordForUser("missing-id", "a-long-enough-one")).rejects.toBeInstanceOf(
      ProfileValidationError,
    );
  });
});
