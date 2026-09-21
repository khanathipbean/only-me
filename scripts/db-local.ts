/**
 * Runs a database command against the machine-local database in
 * `.env.local`, and refuses to run it against anything else.
 *
 * The trap this exists to close: `prisma7.config.ts` does `import
 * "dotenv/config"`, which loads `.env` — and only `.env`. Next loads
 * `.env.local` on top of it, so the app and the Prisma CLI read *different*
 * `DATABASE_URL`s. Someone who has set up a local database and then types
 * `npx prisma db push` gets the live Supabase one, silently, and pushes
 * schema to production believing they are working locally.
 *
 * So: this loads `.env.local` itself, checks the host is local, and only
 * then runs the command. Same guard `e2e/support/guard.ts` applies to the
 * browser tests, for the same reason.
 *
 *   npm run db:local -- db push
 *   npm run db:local -- seed      # prisma/seed.ts, same guard
 *   npm run db:local -- studio
 *
 * To act on the deployed database on purpose, call `prisma` directly — that
 * path is unchanged and still reads `.env`.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1", "0.0.0.0"];
const ENV_FILE = path.join(process.cwd(), ".env.local");

/**
 * Every `KEY=value` in `.env.local`, not only the database URL: a seed run
 * reads `SEED_ADMIN_EMAIL` and friends from the same file, and passing just
 * `DATABASE_URL` through left those ignored and the defaults used instead.
 *
 * A deliberately small parser rather than a dependency: dotenv's own loader
 * would also pull in `.env`, which is the thing being kept out.
 */
function readLocalEnv(): Record<string, string> {
  if (!fs.existsSync(ENV_FILE)) {
    throw new Error(
      ".env.local does not exist.\n" +
        "It is where this machine's own DATABASE_URL lives, and it is git-ignored.\n" +
        "See the LAN server section of README.md.",
    );
  }

  const values: Record<string, string> = {};
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split("\n")) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (match) {
      values[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  return values;
}

const localEnv = readLocalEnv();
const url = localEnv.DATABASE_URL;

if (!url) {
  throw new Error(".env.local has no DATABASE_URL line.");
}

let host: string;
try {
  host = new URL(url).hostname;
} catch {
  throw new Error(`DATABASE_URL in .env.local is not a valid URL: ${url}`);
}

if (!LOCAL_HOSTS.includes(host)) {
  throw new Error(
    `DATABASE_URL in .env.local points at "${host}", which is not a local database.\n` +
      "This command creates and drops tables. Pointed at the deployed database it\n" +
      "would do that to the rows the team is using.\n" +
      "Fix .env.local, or run `npx prisma ...` directly if you truly mean the deployed one.",
  );
}

const args = process.argv.slice(2);
if (args.length === 0) {
  throw new Error("Nothing to run. Try: npm run db:local -- db push");
}

/* `seed` is not a Prisma subcommand here — there is no `prisma.seed` entry in
 * package.json — but it belongs behind the same guard as `db push`: it writes
 * rows, and the plain `npm run db:seed` loads no env file at all, so it would
 * go wherever the ambient DATABASE_URL points. */
const seeding = args[0] === "seed";
const commandArgs = seeding ? ["tsx", "prisma/seed.ts", ...args.slice(1)] : ["prisma", ...args];

console.log(`${commandArgs.join(" ")} → ${host}`);

/* `.env.local` last, so it beats anything `.env` already put in the ambient
 * environment — the same precedence Next gives it. */
const result = spawnSync("npx", commandArgs, {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, ...localEnv },
});

process.exit(result.status ?? 1);
