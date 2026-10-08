import { randomUUID } from "node:crypto";
import { cache } from "react";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth-credentials";
import { deleteFile, uploadFile } from "@/lib/storage";

/** Shortest password this app will accept when someone changes it. */
export const MIN_PASSWORD_LENGTH = 8;

export class ProfileValidationError extends Error {}

const AVATAR_FOLDER = "avatars";
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

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
    select: { id: true, name: true, email: true, avatarKey: true },
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

/** Uploads a new picture and replaces whatever the user had before. */
export async function updateAvatar(userId: string, file: File) {
  if (!AVATAR_TYPES.has(file.type)) {
    throw new ProfileValidationError("Profile picture must be a PNG, JPEG, WEBP, or GIF image");
  }
  if (file.size === 0) {
    throw new ProfileValidationError("That file is empty");
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw new ProfileValidationError(
      `Profile picture is larger than ${Math.round(MAX_AVATAR_BYTES / 1024 / 1024)} MB`,
    );
  }

  const previous = await prisma.user.findUnique({ where: { id: userId }, select: { avatarKey: true } });

  const avatarKey = `${AVATAR_FOLDER}/${randomUUID()}`;
  await uploadFile(avatarKey, Buffer.from(await file.arrayBuffer()), file.type);
  await prisma.user.update({
    where: { id: userId },
    data: { avatarKey, avatarContentType: file.type },
  });

  // Best-effort: the new picture is already live either way, and a leftover
  // blob under the old key costs storage, not correctness.
  if (previous?.avatarKey) {
    await deleteFile(previous.avatarKey).catch(() => {});
  }
}

export async function removeAvatar(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { avatarKey: true } });
  if (!user?.avatarKey) {
    return;
  }
  await prisma.user.update({ where: { id: userId }, data: { avatarKey: null, avatarContentType: null } });
  await deleteFile(user.avatarKey).catch(() => {});
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

/**
 * The "forgot password" flow, and deliberately not `changePassword`'s: there
 * is no mail infrastructure anywhere in this app to prove the requester owns
 * the address (see `docs/agents` / the Tier 2 gap list — self-service reset
 * was scoped out for exactly this reason), and `email` here is a self-chosen
 * login identifier rather than a verified inbox. Knowing the email is
 * therefore the whole check, by explicit product choice for this app's
 * threat model — not an oversight.
 */
/**
 * Set someone else's password, for an administrator who has already been
 * checked by the caller.
 *
 * This replaces a self-serve reset that took an email address and a new
 * password from an unauthenticated page and simply applied them. Anyone who
 * knew an address could take that account, including the one that administers
 * every project, and no email was ever sent to the owner to say so.
 *
 * An emailed token is the usual answer and is not available here: the app has
 * no way to send mail at all, so a token would have to be read out of the
 * database by the person it is meant to authenticate. Until there is a mailer,
 * the person who vouches for someone is an administrator, which is the same
 * answer the app already gives for creating the account in the first place.
 *
 */
export async function setPasswordForUser(targetUserId: string, newPassword: string) {
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new ProfileValidationError(
      `New password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true },
  });
  if (!user) {
    throw new ProfileValidationError("That user no longer exists");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword) },
  });

  /* Not written to the audit log. Every entry it takes belongs to a project,
   * and a password is not a project's business — recording this properly
   * means user-level entries, which the log has never had. Worth adding; not
   * worth widening a schema inside a security fix. */
}
