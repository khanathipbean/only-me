# End-to-end tests

Browser tests, for the things only a browser can answer: a dialog that opens, a
toast that lands in the right corner, a list that refreshes after a server
action. The Vitest suite in `tests/` still covers the services and the rules —
that is where it is cheap to test them.

## Running them

```bash
npm run db:dev     # Postgres on 54330, leave it running
npm run test:e2e
```

The first run creates the `e2edb` database if it is missing, pushes the schema
into it and seeds one fixture project. Everything after that is incremental.

```bash
npm run test:e2e:ui       # pick and watch individual tests
npm run test:e2e:report   # open the HTML report of the last run
```

## What it runs against

Its **own** database (`e2edb`) and its **own** dev server (port 3100, build
directory `.next-e2e`) — not the one you have open on 3000.

That separation is the whole point. These tests archive, rename and delete for
real, and this repo's `.env` points `DATABASE_URL` at the live Supabase
instance. `e2e/support/guard.ts` refuses to start if the target is not a local
database; `e2e/support/database.ts` is the one place that decides what the
target is, and `playwright.config.ts` hands the same value to the server it
launches, so the two cannot drift apart.

`devdb` beside it is left alone — whatever you have been building there by hand
is not the suite's to clear.

## Writing one

- Signing in is already done: `auth.setup.ts` runs first and saves the session,
  so specs start logged in.
- A test that needs a project makes its own, through the UI, with a unique
  code. Nothing should depend on what another test left behind.
- Prefer roles and names (`getByRole("button", { name: "Archive" })`) over
  classes, which change every time something is restyled.
