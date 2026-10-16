import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { authenticateWithPassword, hashPassword } from "@/lib/auth-credentials";
import { isAuthorized } from "@/auth.config";
import { uniqueEmail } from "./support/fixtures";
import {
  LOCK_MINUTES,
  MAX_FAILURES,
  WINDOW_MINUTES,
  readLockState,
  recordFailure,
} from "@/lib/login-throttle";

describe("authenticateWithPassword", () => {
  /* The address is the subject here, not scenery: these tests sign in with it.
   * One name, created once and used by every test below. */
  const signsIn = uniqueEmail("qa-lead");

  beforeAll(async () => {
    await prisma.user.create({
      data: {
        email: signsIn,
        passwordHash: await hashPassword("correct-horse-battery-staple"),
        name: "QA Lead",
      },
    });
  });

  it("returns the user for a valid email and password", async () => {
    const user = await authenticateWithPassword({
      email: signsIn,
      password: "correct-horse-battery-staple",
    });

    expect(user).not.toBeNull();
    expect(user?.email).toBe(signsIn);
  });

  it("returns null for a wrong password", async () => {
    const user = await authenticateWithPassword({
      email: signsIn,
      password: "wrong-password",
    });

    expect(user).toBeNull();
  });

  it("returns null for an unknown email", async () => {
    const user = await authenticateWithPassword({
      email: uniqueEmail("nobody"),
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
    const lockedOut = uniqueEmail("locked-out");
    const user = await prisma.user.create({
      data: {
        email: lockedOut,
        passwordHash: await hashPassword("the-old-one"),
        name: "Locked Out",
      },
    });

    await setPasswordForUser(user.id, "a-brand-new-one");

    expect(
      await authenticateWithPassword({
        email: lockedOut,
        password: "a-brand-new-one",
      }),
    ).toMatchObject({ id: user.id });
    // And the old one stops working, or nothing was really replaced.
    expect(
      await authenticateWithPassword({
        email: lockedOut,
        password: "the-old-one",
      }),
    ).toBeNull();
  });

  it("refuses a password too short to be worth setting", async () => {
    const { setPasswordForUser, ProfileValidationError } = await import("@/lib/users");
    const user = await prisma.user.create({
      data: {
        email: uniqueEmail("short-password"),
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

/**
 * Before this, the form took passwords as fast as the server could answer
 * them. bcrypt makes each guess slow; it does not make the number of guesses
 * finite, and nothing else was counting.
 */
describe("how many wrong passwords an address gets", () => {
  const RIGHT = "correct-horse-battery-staple";

  async function makeUser() {
    const email = uniqueEmail("throttled");
    await prisma.user.create({
      data: { email, passwordHash: await hashPassword(RIGHT), name: "Throttled" },
    });
    return email;
  }

  it("lets the right password through after four wrong ones", async () => {
    const email = await makeUser();

    for (let attempt = 0; attempt < MAX_FAILURES - 1; attempt += 1) {
      expect(await authenticateWithPassword({ email, password: "wrong" })).toBeNull();
    }

    expect(await authenticateWithPassword({ email, password: RIGHT })).not.toBeNull();
  });

  it("refuses the right password once the limit is reached", async () => {
    const email = await makeUser();

    for (let attempt = 0; attempt < MAX_FAILURES; attempt += 1) {
      expect(await authenticateWithPassword({ email, password: "wrong" })).toBeNull();
    }

    /* The point of the whole feature. A limit that still admitted the correct
     * password would only inconvenience somebody who had already guessed it. */
    expect(await authenticateWithPassword({ email, password: RIGHT })).toBeNull();
    expect((await readLockState(email)).locked).toBe(true);
  });

  it("forgets the failures as soon as the right password arrives", async () => {
    const email = await makeUser();

    await authenticateWithPassword({ email, password: "wrong" });
    await authenticateWithPassword({ email, password: "wrong" });
    await authenticateWithPassword({ email, password: RIGHT });

    // Four more must not reach the limit, or the earlier two were still counted.
    for (let attempt = 0; attempt < MAX_FAILURES - 1; attempt += 1) {
      await authenticateWithPassword({ email, password: "wrong" });
    }
    expect(await authenticateWithPassword({ email, password: RIGHT })).not.toBeNull();
  });

  it("lets the address back in once the lock has expired", async () => {
    const email = await makeUser();

    /* The failures happened long enough ago that the lock they set has
     * already run out by the time this test asks. Dated in the past rather
     * than read at a pretend future moment, because `authenticateWithPassword`
     * reads the real clock and would still have seen a live lock. */
    const longAgo = new Date(Date.now() - (LOCK_MINUTES + 1) * 60_000);
    for (let attempt = 0; attempt < MAX_FAILURES; attempt += 1) {
      await recordFailure(email, longAgo);
    }
    expect((await readLockState(email, longAgo)).locked).toBe(true);

    expect((await readLockState(email)).locked).toBe(false);
    expect(await authenticateWithPassword({ email, password: RIGHT })).not.toBeNull();
  });

  it("does not carry failures across the window", async () => {
    const email = await makeUser();
    const start = new Date();

    // Four now, and a fifth long enough afterwards to start a fresh window:
    // five typos spread over a year must not lock anybody out.
    for (let attempt = 0; attempt < MAX_FAILURES - 1; attempt += 1) {
      await recordFailure(email, start);
    }
    const later = new Date(start.getTime() + (WINDOW_MINUTES + 1) * 60_000);
    expect((await recordFailure(email, later)).locked).toBe(false);
  });

  it("counts an address nobody owns, so a lock never proves an account exists", async () => {
    const strangerEmail = uniqueEmail("no-such-account");

    for (let attempt = 0; attempt < MAX_FAILURES; attempt += 1) {
      expect(await authenticateWithPassword({ email: strangerEmail, password: "x" })).toBeNull();
    }

    expect((await readLockState(strangerEmail)).locked).toBe(true);
  });

  it("treats the address as one address however it is capitalised", async () => {
    const email = await makeUser();

    for (let attempt = 0; attempt < MAX_FAILURES; attempt += 1) {
      await recordFailure(attempt % 2 === 0 ? email.toUpperCase() : email);
    }

    expect((await readLockState(email)).locked).toBe(true);
  });
});
