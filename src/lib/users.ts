import { cache } from "react";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth-credentials";

/** Shortest password this app will accept when someone changes it. */
export const MIN_PASSWORD_LENGTH = 8;

export class ProfileValidationError extends Error {}

/**
 * The signed-in user's own record.
 *
 * Read from the database rather than the session: `name` is baked into the JWT
 * at sign-in, so after someone renames themselves the header would keep the
 * old name until they signed out and back in. Wrapped in `cache` so the layout
 * and any page in the same request share one query.
 */
export const getUserById = cache(async (id: string) => {
  return prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true },
  });
});

export async function updateDisplayName(userId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new ProfileValidationError("Display name is required");
  }
  return prisma.user.update({
    where: { id: userId },
    data: { name: trimmed },
    select: { id: true, name: true, email: true },
  });
}

/**
 * Changes a password, and only for someone who can prove they know the current
 * one — otherwise anyone who found a signed-in machine unattended could take
 * the account over without ever knowing its password.
 *
 * No audit entry: `AuditLog.projectId` is a required foreign key and a profile
 * change belongs to no project, so recording it would mean a schema change.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
) {
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new ProfileValidationError(
      `New password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user) {
    throw new ProfileValidationError("Account not found");
  }

  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new ProfileValidationError("Current password is incorrect");
  }
  if (await bcrypt.compare(newPassword, user.passwordHash)) {
    throw new ProfileValidationError("New password must differ from the current one");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword) },
  });
}
