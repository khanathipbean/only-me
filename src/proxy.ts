export { auth as proxy } from "@/auth";

/**
 * Page routes only. `/api` is excluded because every route under it already
 * checks the session itself and answers 401 — letting the middleware handle
 * them instead turned an expired session into a 307 to the login *page*, so
 * `fetch` followed it, got HTML with status 200, and the caller fell over
 * parsing JSON rather than seeing it had been signed out.
 */
export const config = {
  matcher: [
    "/((?!api|login|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
