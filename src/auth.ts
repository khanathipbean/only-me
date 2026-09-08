import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authenticateWithPassword, isAuthorized } from "@/lib/auth-credentials";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
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
