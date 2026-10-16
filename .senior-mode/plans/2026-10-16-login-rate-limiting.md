# Rate-limit the login form — Plan

Goal: five wrong passwords for one address locks that address for 15 minutes.

Current vs desired (Diff):
- now: `authenticateWithPassword` compares a bcrypt hash and returns the user
  or null. Nothing counts, nothing waits. An attacker can try passwords as
  fast as the server answers, forever.
- want: the sixth attempt inside 15 minutes is refused without checking the
  password at all, and the form says how long is left.

## Decisions taken

- **Lock for 15 minutes after 5 failures.** Not a growing delay: a delay costs
  Netlify function time for every attacker, and Netlify bills by the second.
- **Count per email address, not per IP.** An attacker rotates IPs; a
  colleague does not. Per-IP would also lock a whole office behind one NAT.
- **The counter lives in Postgres.** Netlify runs this as serverless
  functions: two requests can land on two instances, and an instance dies
  whenever it likes. An in-memory counter resets itself for free, which is
  the same as having none.

## Where the check goes, and why not the obvious place

The login page's server action is the wrong choke point. NextAuth also exposes
`/api/auth/callback/credentials`, so anything enforced in the page is skipped
by posting to that route directly.

So the rule lives in `authenticateWithPassword`, which both paths go through.

The *message* is a separate problem: the page catches `AuthError` and cannot
see why. Rather than unpicking NextAuth's error wrapping (a beta, and its
internals are not ours), the action re-reads the lock state for that address
after a failure and picks the message from it. Enforcement and explanation
stay independent.

## Not leaking who has an account

Attempts are counted for any address typed into the form, whether or not a
user owns it. If only real accounts were counted, "locked" would confirm the
address exists — which the generic "Invalid email or password" above it is
there to avoid.

Out of scope / do NOT touch (Fence):
- password hashing, session handling, `auth.config.ts`
- the login page's layout and artwork — only the error paragraph changes
- every other page

Risks & unknowns:
- New table, so production needs `prisma db push`. ASK FIRST.
- A locked account is answered without a bcrypt compare, so it replies faster
  than a wrong password does. Accepted: the form says it is locked anyway.
- Resetting on success must happen inside `authenticateWithPassword` — after
  a successful `signIn` the action never runs again, it redirects.

## Steps
1. `LoginThrottle` model in the schema — verify: `prisma validate`, test DB picks it up
2. `src/lib/login-throttle.ts` — record, read, clear — verify: unit tests
3. Wire into `authenticateWithPassword` — verify: a test proves the 6th attempt is refused with the right password
4. Message on the login page — verify: e2e
5. Full suite, build, browser tests
6. Ask before touching production
