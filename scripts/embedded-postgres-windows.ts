import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

/**
 * embedded-postgres's own `.start()`/`.stop()` spawn `postgres.exe` directly.
 * On Windows, postgres.exe refuses to run at all when the calling process
 * token is elevated (Administrator) — a hard security guard built into
 * Postgres itself ("Execution of PostgreSQL by a user with administrative
 * permissions is not permitted"), unrelated to file/directory permissions.
 * `pg_ctl start` doesn't hit this: on Windows it re-execs postgres.exe under
 * a *restricted* token (with the Administrators group SID disabled) before
 * launching it — exactly the dance Postgres expects there. embedded-postgres
 * never uses pg_ctl, so this module drives it directly, Windows-only; every
 * other platform keeps using the library's own start()/stop()/createDatabase(),
 * which have no such restriction.
 */

async function resolvePgCtl(): Promise<string> {
  const { pg_ctl } = await import("@embedded-postgres/windows-x64");
  return pg_ctl;
}

/**
 * Deliberately NOT `child_process.exec`/`execFile` (promisified or not): those
 * resolve on the child's 'close' event, which waits for its stdio streams to
 * end — but `pg_ctl start` forks postgres.exe as a long-running detached
 * server that can inherit pg_ctl's stdout/stderr handles on Windows. If it
 * does, that pipe never sees EOF once pg_ctl itself has already exited, and
 * `exec`'s callback (or the promisified rejection/resolution) simply never
 * fires — the await hangs forever even though the command actually finished.
 * `spawn` + the 'exit' event sidesteps this: 'exit' fires as soon as the
 * immediate child (pg_ctl) terminates, regardless of what its descendants
 * still hold open.
 */
function runToExit(command: string, args: string[]): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout?.on("data", (chunk) => {
      output += chunk.toString("utf-8");
    });
    child.stderr?.on("data", (chunk) => {
      output += chunk.toString("utf-8");
    });
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code, output }));
  });
}

export async function startWindowsSafe(databaseDir: string, port: number): Promise<void> {
  const pgCtl = await resolvePgCtl();
  // Inside databaseDir (not a fixed os.tmpdir() path keyed only by port): that
  // directory is unique per run (or, for the persistent dev DB, at least
  // always owned by the current user from initialise()), so the log file
  // can't collide with — or get permission-denied by — a stale file left
  // over from a previous, differently-privileged run.
  const logFile = path.join(databaseDir, "pg_ctl-start.log");

  const { code, output } = await runToExit(pgCtl, [
    "start",
    "-D",
    databaseDir,
    "-o",
    `-p ${port}`,
    "-l",
    logFile,
    "-w",
    "-t",
    "60",
  ]);

  if (code !== 0) {
    let log = "";
    try {
      log = readFileSync(logFile, "utf-8");
    } catch {
      // No log file yet — the failure happened before postgres could write one.
    }
    throw new Error(`pg_ctl start failed (exit code ${code}): ${output}${log ? `\n\nLog output:\n${log}` : ""}`);
  }
}

export async function stopWindowsSafe(databaseDir: string): Promise<void> {
  const pgCtl = await resolvePgCtl();
  await runToExit(pgCtl, ["stop", "-D", databaseDir, "-m", "fast", "-w", "-t", "60"]).catch(() => {
    // Already stopped, or never started — nothing to do.
  });
}

export async function createDatabaseWindowsSafe(port: number, name: string): Promise<void> {
  const client = new Client({ user: "postgres", password: "postgres", port, host: "127.0.0.1", database: "postgres" });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE ${client.escapeIdentifier(name)}`);
  } finally {
    await client.end();
  }
}
