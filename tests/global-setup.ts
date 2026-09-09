import EmbeddedPostgres from "embedded-postgres";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDatabaseWindowsSafe, startWindowsSafe, stopWindowsSafe } from "../scripts/embedded-postgres-windows";

const PORT = 54329;
const DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${PORT}/test`;
const isWindows = os.platform() === "win32";

export default async function setup() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "only-me-test-pg-"));

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    port: PORT,
    user: "postgres",
    password: "postgres",
    persistent: false,
    // Without this, initdb infers encoding from the host OS locale — on a
    // Thai-locale Windows machine that resolves to WIN1252, which can't
    // store Thai (or most non-Latin1) text at all. Force UTF8 explicitly.
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
  });

  await pg.initialise();

  // See scripts/embedded-postgres-windows.ts: on Windows, embedded-postgres's
  // own .start() spawns postgres.exe directly, which refuses to run under an
  // elevated (Administrator) process token. Drive pg_ctl ourselves instead.
  if (isWindows) {
    await startWindowsSafe(dataDir, PORT);
    await createDatabaseWindowsSafe(PORT, "test");
  } else {
    await pg.start();
    await pg.createDatabase("test");
  }

  process.env.DATABASE_URL = DATABASE_URL;

  execSync("npx prisma db push --accept-data-loss", {
    env: { ...process.env, DATABASE_URL },
    stdio: "inherit",
  });

  return async () => {
    if (isWindows) {
      await stopWindowsSafe(dataDir);
    } else {
      await pg.stop();
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
  };
}
