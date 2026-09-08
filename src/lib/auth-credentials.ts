import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const BCRYPT_ROUNDS = 10;

export type LoginCredentials = {
  email: string;
  password: string;
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function isAuthorized(session: { user?: unknown } | null | undefined) {
  return Boolean(session?.user);
}

export async function authenticateWithPassword(credentials: LoginCredentials) {
  const user = await prisma.user.findUnique({
    where: { email: credentials.email },
  });

  if (!user) {
    return null;
  }

  const isValid = await bcrypt.compare(credentials.password, user.passwordHash);

  if (!isValid) {
    return null;
  }

  return { id: user.id, email: user.email, name: user.name };
}
