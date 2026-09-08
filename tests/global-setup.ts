import EmbeddedPostgres from "embedded-postgres";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PORT = 54329;
const DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${PORT}/test`;

export default async function setup() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "only-me-test-pg-"));

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    port: PORT,
    user: "postgres",
    password: "postgres",
    persistent: false,
  });

  await pg.initialise();
  await pg.start();
  await pg.createDatabase("test");

  process.env.DATABASE_URL = DATABASE_URL;

  execSync("npx prisma db push --accept-data-loss", {
    env: { ...process.env, DATABASE_URL },
    stdio: "inherit",
  });

  return async () => {
    await pg.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  };
}
