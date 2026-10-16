# Performance — what was measured, and what is left (parked)

Measured 2026-10-16, against the real Supabase instance from a machine in
Thailand. Parked by decision: come back once the feature work settles.

## There is no N+1 anywhere

Tested the way that settles it — whether the query count moves when the row
count does, not by reading the code:

                    5 rows   25 rows   100 rows
  Projects list       5 q      5 q       5 q
  Test Cases list     3 q      3 q       3 q
  Test Run rows      12 q     12 q      12 q

`listRunHistoryForCases`, the one most likely to be per-row, answers 1 case in
7 queries and 474 cases in 7 queries (25 ms). Nothing to fix here.

## What is slow is the number of round trips, not the queries

Against production:

  Dashboard         24 queries   1,325 ms
  Global search     25 queries   1,036 ms
  Test Run rows     12 queries     524 ms
  Problem Cases     12 queries     502 ms
  Project overview  11 queries     479 ms
  Projects list      5 queries     402 ms
  Test Cases list    3 queries     156 ms
  Members            3 queries     127 ms

1,325 / 24 ≈ 55 ms per query. The time *is* the query count times the latency,
even though these pages use `Promise.all`.

## Why: the pool is one connection

`src/lib/prisma.ts` sets `max: 1`, so queries written to run together queue on
a single connection. Ten 50 ms queries fired at once, against production:

  max= 1   924 ms      max= 2   529 ms
  max= 5   355 ms      max=10   283 ms

Same pages, fresh process per pool size:

                     max=1     max=5
  Dashboard         1,067 ms    553 ms
  Project overview    422 ms    158 ms
  Global search       975 ms    321 ms

`max: 1` is not a mistake — the comment beside it is about serverless
containers each holding their own pool.

## The budget, from the Supabase dashboard

  Max client connections   200   <- how many clients the pooler accepts
  Connection pool size      15   <- connections the pooler opens to Postgres

Fifteen is the number that binds, not two hundred. And `DATABASE_URL` points
at port **5432**, which is Supabase's *session* mode: a client holds its
server connection for the whole session rather than returning it per
transaction. Three containers at `max: 5` would take all fifteen.

## What to do when this is picked up again

1. **Find the Netlify function region first.** Everything above was measured
   from Thailand to ap-southeast-1. If the functions run in us-east, each
   round trip is nearer 200 ms and the Dashboard is five seconds, not one and
   a third. Moving the region would then matter more than anything else here.
2. Only then consider `max: 1` -> `3`. Worth roughly 2x; re-measure against
   production before committing it rather than trusting these numbers.
3. Port 6543 (transaction mode) is what Supabase recommends for serverless and
   would use those fifteen connections far better. Kept separate: it changes
   how the app connects, and transaction mode drops prepared statements and
   some session features — nobody has checked yet what this code relies on.

## Still never looked at

- `src/lib/import/` (734 lines), the most complex path in the project
- Server-side render time; only the data layer was measured
