import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe subset of the NextAuth config: no providers, so nothing here
 * statically imports Prisma (which pulls in the `pg` driver — a Node-only
 * package that fails to load in Netlify's Edge Function runtime). `proxy.ts`
 * builds its own NextAuth instance from this config alone; the Credentials
 * provider (which does need the database) is added on top of it only in
 * `auth.ts`, used by the Node.js-runtime /api/auth route.
 */
export function isAuthorized(session: { user?: unknown } | null | undefined) {
  return Boolean(session?.user);
}

export const authConfig = {
  session: { strategy: "jwt", maxAge: 8 * 60 * 60, updateAge: 60 * 60 },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    authorized: ({ auth }) => isAuthorized(auth),
    jwt: ({ token, user }) => {
      if (user) {
        token.userId = user.id;
      }
      return token;
    },
    session: ({ session, token }) => {
      if (session.user) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
