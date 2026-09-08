# 01: Auth & Session Foundation

**What to build:** A user can log in with email + password and reach an authenticated area of the app; every other ticket's API routes and pages can require a session and read the current `userId` from it.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] `User` model in `prisma/schema.prisma`: `id`, `email` (unique), `passwordHash`, `name`, `createdAt`, `updatedAt`
- [x] Auth.js v5 (`next-auth@beta`) configured with the Credentials provider and JWT session strategy (no `Account`/`Session` DB tables needed since there's no OAuth provider and no DB session strategy)
- [x] Passwords hashed with bcrypt on user creation; the Credentials `authorize` callback verifies email + password against the hash
- [x] A seed script creates one initial user (email/password from env or hardcoded dev default) — there is no public self-registration route; user provisioning for later tickets (Project membership, roles) is out of scope here
- [x] `/login` page: email + password form; shows an error message on invalid credentials; redirects to `/` on success
- [x] Unauthenticated requests to any non-`/login` page or `/api/**` route are redirected to `/login` (or receive 401 for API routes)
- [x] Server components and route handlers can read the current session's `userId` via Auth.js's `auth()` helper
- [x] A logout action clears the session and returns the user to `/login`
- [x] Integration test: `authorize` (or the login route) succeeds with valid credentials and fails with wrong password / unknown email

## Comments

Implemented with Next.js 16's `proxy.ts` (the renamed `middleware.ts`, Node.js runtime by default — required since Prisma can't run in the old Edge runtime). Test seam agreed: `authenticateWithPassword()` and `isAuthorized()` as pure functions in `src/lib/auth-credentials.ts`, tested against the embedded-Postgres test DB (6 tests, all passing).

Code review (Standards + Spec axes) caught two real bugs before this was considered done: (1) no `callbacks.authorized` meant next-auth's default (`true`) let every request through the proxy unguarded; (2) no `jwt`/`session` callbacks meant `userId` was never attached to the session, contradicting this ticket's own stated purpose for every later ticket. Both fixed, plus three minor naming/duplication cleanups. Re-verified: typecheck, lint, 6 tests, and a clean production build all pass after the fixes.

Test-infra note: `npm test` needs `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` set (Prisma's own AI-agent safety guardrail) since `tests/global-setup.ts` runs `prisma db push --accept-data-loss` against the ephemeral embedded-Postgres instance it spins up per run — the user explicitly consented to this for the test DB only.
