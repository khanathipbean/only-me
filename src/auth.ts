import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authenticateWithPassword, isAuthorized } from "@/lib/auth-credentials";

export const { handlers, auth, signIn, signOut } = NextAuth({
  /**
   * Without an explicit `maxAge` the JWT lasts NextAuth's default 30 days,
   * which for a tool people sign into at work means the session never
   * practically expires. Eight hours covers a working day; `updateAge`
   * re-issues the token at most hourly, so someone actively using the app is
   * never signed out mid-task and the clock really measures idle time.
   */
  session: { strategy: "jwt", maxAge: 8 * 60 * 60, updateAge: 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        if (
          typeof credentials?.email !== "string" ||
          typeof credentials?.password !== "string"
        ) {
          return null;
        }

        return authenticateWithPassword({
          email: credentials.email,
          password: credentials.password,
        });
      },
    }),
  ],
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
});
