import { prisma } from "@/lib/prisma";

/**
 * How many wrong passwords an email address is allowed, and for how long it
 * pays for going over.
 *
 * The limit is the only thing standing between this login form and somebody
 * trying passwords as fast as the server answers: nothing else counts
 * attempts, and bcrypt alone only makes each guess slow, not finite.
 */
export const MAX_FAILURES = 5;
export const WINDOW_MINUTES = 15;
export const LOCK_MINUTES = 15;

/** Changing the capitalisation must not buy a fresh count. */
function key(email: string) {
  return email.trim().toLowerCase();
}

export type LockState =
  | { locked: false }
  | { locked: true; until: Date; minutesLeft: number };

function minutesUntil(until: Date, now: Date) {
  // Rounded up, so "1 minute left" never reads as zero while still locked.
  return Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 60_000));
}

/**
 * Whether this address is locked right now. Read-only — it never starts or
 * extends a lock, so the login page can call it just to word its message.
 */
export async function readLockState(email: string, now = new Date()): Promise<LockState> {
  const row = await prisma.loginThrottle.findUnique({ where: { email: key(email) } });

  if (!row?.lockedUntil || row.lockedUntil <= now) {
    return { locked: false };
  }

  return { locked: true, until: row.lockedUntil, minutesLeft: minutesUntil(row.lockedUntil, now) };
}

/**
 * Counts one wrong password, and locks the address once the count is reached.
 *
 * The window rolls: failures older than `WINDOW_MINUTES` are forgotten rather
 * than carried forward, or an account would eventually lock on five typos
 * spread across a year.
 */
export async function recordFailure(email: string, now = new Date()): Promise<LockState> {
  const id = key(email);
  const row = await prisma.loginThrottle.findUnique({ where: { email: id } });

  const windowStillOpen =
    row !== null && now.getTime() - row.firstFailureAt.getTime() < WINDOW_MINUTES * 60_000;
  const failures = (windowStillOpen ? row.failures : 0) + 1;

  if (failures < MAX_FAILURES) {
    await prisma.loginThrottle.upsert({
      where: { email: id },
      create: { email: id, failures, firstFailureAt: now },
      update: { failures, ...(windowStillOpen ? {} : { firstFailureAt: now, lockedUntil: null }) },
    });
    return { locked: false };
  }

  /* The count resets along with the lock: when the fifteen minutes are up the
   * address gets a full set of attempts again, rather than locking on the
   * very next mistake forever after. */
  const until = new Date(now.getTime() + LOCK_MINUTES * 60_000);
  await prisma.loginThrottle.upsert({
    where: { email: id },
    create: { email: id, failures: 0, firstFailureAt: now, lockedUntil: until },
    update: { failures: 0, firstFailureAt: now, lockedUntil: until },
  });
  return { locked: true, until, minutesLeft: minutesUntil(until, now) };
}

/**
 * The lock state of several addresses at once, keyed by the address as it was
 * passed in.
 *
 * One query rather than one per row: the Members page shows every account in
 * the system, and asking per row would turn opening that page into as many
 * round trips as there are people.
 */
export async function readLockStates(
  emails: string[],
  now = new Date(),
): Promise<Map<string, LockState>> {
  const rows = await prisma.loginThrottle.findMany({
    where: { email: { in: emails.map(key) }, lockedUntil: { gt: now } },
  });
  const byKey = new Map(rows.map((row) => [row.email, row.lockedUntil!]));

  return new Map(
    emails.map((email) => {
      const until = byKey.get(key(email));
      return [
        email,
        until
          ? { locked: true as const, until, minutesLeft: minutesUntil(until, now) }
          : { locked: false as const },
      ];
    }),
  );
}

/** Forgets everything about an address — called when its password is right,
 *  and by an administrator letting somebody back in early. */
export async function clearFailures(email: string) {
  await prisma.loginThrottle.deleteMany({ where: { email: key(email) } });
}
