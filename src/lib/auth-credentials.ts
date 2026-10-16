import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { clearFailures, readLockState, recordFailure } from "@/lib/login-throttle";

const BCRYPT_ROUNDS = 10;

export type LoginCredentials = {
  email: string;
  password: string;
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * The one door. The login page is not the place to count attempts, however
 * much it looks like it: NextAuth also answers at
 * `/api/auth/callback/credentials`, so anything enforced in the page is
 * skipped by posting to that route instead. Both paths come through here.
 *
 * A locked address is refused before the hash is compared, so the right
 * password does not get in either — otherwise the limit would only slow down
 * an attacker who had already lost.
 */
export async function authenticateWithPassword(credentials: LoginCredentials) {
  if ((await readLockState(credentials.email)).locked) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { email: credentials.email },
  });

  /* Counted even when no account owns the address. Counting only real ones
   * would make a lock prove the address exists, which is exactly what the
   * form's "Invalid email or password" declines to say. */
  if (!user) {
    await recordFailure(credentials.email);
    return null;
  }

  const isValid = await bcrypt.compare(credentials.password, user.passwordHash);

  if (!isValid) {
    await recordFailure(credentials.email);
    return null;
  }

  /* Here rather than in the page: a successful sign-in redirects, so nothing
   * downstream of it ever runs. */
  await clearFailures(credentials.email);

  return { id: user.id, email: user.email, name: user.name };
}
