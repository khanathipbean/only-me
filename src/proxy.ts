import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

/**
 * A separate, edge-safe NextAuth instance built from `authConfig` alone —
 * not the `auth` exported by `@/auth`, which pulls in the Credentials
 * provider and (through it) Prisma. Edge middleware only needs to read the
 * session cookie; it never runs the sign-in flow, so `authConfig` on its own
 * is enough for the `authorized` callback below.
 *
 * Assigned to a plain identifier rather than exported straight off the
 * destructure: Next's build-time check for a valid proxy export only
 * recognises `export const proxy = ...`, not a destructuring pattern.
 */
const { auth } = NextAuth(authConfig);
export const proxy = auth;

/**
 * Page routes only. `/api` is excluded because every route under it already
 * checks the session itself and answers 401 — letting the middleware handle
 * them instead turned an expired session into a 307 to the login *page*, so
 * `fetch` followed it, got HTML with status 200, and the caller fell over
 * parsing JSON rather than seeing it had been signed out.
 *
 * Each excluded name requires a following `/` or end-of-string
 * (`(?=/|$)`), not just a matching prefix — otherwise a future route like
 * `/login-history` or `/forgot-password-notes` would also skip auth just
 * for starting with one of these names.
 */
export const config = {
  matcher: [
    "/((?!(?:api|login|forgot-password)(?:/|$)|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
