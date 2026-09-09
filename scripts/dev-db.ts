import EmbeddedPostgres from "embedded-postgres";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDatabaseWindowsSafe, startWindowsSafe } from "./embedded-postgres-windows";

const PORT = 54330;
const DATA_DIR = path.resolve(__dirname, "..", ".dev-postgres-data");
export const DEV_DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${PORT}/devdb`;
const isWindows = os.platform() === "win32";

async function main() {
  const alreadyInitialised = fs.existsSync(DATA_DIR);

  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    port: PORT,
    user: "postgres",
    password: "postgres",
    persistent: true,
    // Without this, initdb infers encoding from the host OS locale — on a
    // Thai-locale Windows machine that resolves to WIN1252, which can't
    // store Thai (or most non-Latin1) text at all. Force UTF8 explicitly.
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
  });

  if (!alreadyInitialised) {
    await pg.initialise();
  }

  // See scripts/embedded-postgres-windows.ts: on Windows, embedded-postgres's
  // own .start() spawns postgres.exe directly, which refuses to run under an
  // elevated (Administrator) process token. Drive pg_ctl ourselves instead.
  if (isWindows) {
    await startWindowsSafe(DATA_DIR, PORT);
  } else {
    await pg.start();
  }

  try {
    if (isWindows) {
      await createDatabaseWindowsSafe(PORT, "devdb");
    } else {
      await pg.createDatabase("devdb");
    }
  } catch {
    // Already exists from a previous run.
  }

  console.log(`Dev Postgres running at ${DEV_DATABASE_URL}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
