import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  authenticateWithPassword,
  hashPassword,
  isAuthorized,
} from "@/lib/auth-credentials";

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
