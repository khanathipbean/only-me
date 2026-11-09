import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

/**
 * One backup: the database, the uploaded files, and a note about both.
 *
 * Two copies on purpose, and they guard different things. The one under
 * `BACKUP_DIR` is on the machine's own disk and covers the mistakes — a
 * migration that went wrong, a row deleted in the wrong database, a folder
 * cleaned out. The one on the removable drive is a different piece of
 * hardware and covers that disk failing, which the first copy cannot.
 *
 * Nothing here is clever. A backup script is read once, in a bad hour, by
 * somebody who needs to know exactly where their data is.
 */

/* `.env.local` first: that is where the address of the database this install
 * actually serves lives. `.env` holds the deployed one, which is not what is
 * being backed up here. */
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });

const BACKUP_DIR = process.env.BACKUP_DIR ?? "C:\\only-me-data\\backups";
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "C:\\only-me-data\\uploads";
const PG_BIN = process.env.PG_BIN ?? "C:\\only-me-data\\tools\\pgsql\\bin";
/** The removable drive is found by the name written on it, not by its letter:
 *  letters move when something else is plugged in first, and a backup that
 *  quietly writes to whatever is in that slot is worse than one that stops. */
const DRIVE_LABEL = process.env.BACKUP_DRIVE_LABEL ?? "ONLYME-BKP";
/** How many to keep. Thirty of these is under a gigabyte at today's size, and
 *  the point of keeping several is that the newest one may already contain
 *  whatever went wrong. */
const KEEP = Number(process.env.BACKUP_KEEP ?? 30);

function stamp(at: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}` +
    `_${pad(at.getHours())}${pad(at.getMinutes())}`
  );
}

/** Postgres settings as environment, so the password never appears in a
 *  command line that any other account on the machine can read. */
function connectionEnv(url: string) {
  const parsed = new URL(url);
  return {
    ...process.env,
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || "5432",
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: parsed.pathname.replace(/^\//, ""),
  };
}

/** The drive with that name, or null when it is not plugged in. */
function removableTarget(): string | null {
  try {
    const out = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `(Get-Volume -FileSystemLabel '${DRIVE_LABEL}' -ErrorAction SilentlyContinue).DriveLetter`,
      ],
      { encoding: "utf8" },
    ).trim();
    return out ? `${out}:\\only-me-backups` : null;
  } catch {
    return null;
  }
}

function folderSize(dir: string): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;
  const walk = (at: string) => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const full = path.join(at, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        files += 1;
        bytes += statSync(full).size;
      }
    }
  };
  if (existsSync(dir)) {
    walk(dir);
  }
  return { files, bytes };
}

function prune(root: string) {
  if (!existsSync(root)) {
    return;
  }
  const kept = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}_\d{4}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  for (const old of kept.slice(KEEP)) {
    rmSync(path.join(root, old), { recursive: true, force: true });
  }
}

function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set — nothing to back up");
  }
  const pgDump = path.join(PG_BIN, "pg_dump.exe");
  if (!existsSync(pgDump)) {
    throw new Error(`pg_dump is not at ${pgDump} — set PG_BIN to where it lives`);
  }

  const at = new Date();
  const name = stamp(at);
  const here = path.join(BACKUP_DIR, name);
  mkdirSync(here, { recursive: true });

  /* Custom format, not plain SQL: `pg_restore` can then rebuild one table or
   * the lot, and the file is compressed on the way out. */
  const dump = path.join(here, "db.dump");
  execFileSync(pgDump, ["--format=custom", "--file", dump, "--no-owner", "--no-privileges"], {
    env: connectionEnv(url),
    stdio: ["ignore", "inherit", "inherit"],
  });

  const uploads = folderSize(UPLOAD_DIR);
  if (existsSync(UPLOAD_DIR)) {
    cpSync(UPLOAD_DIR, path.join(here, "uploads"), { recursive: true });
  }

  const target = removableTarget();
  const copiedTo = target ? path.join(target, name) : null;

  /* Written before the copy, not after: the copy on the removable drive is
   * the one somebody reaches for when the machine is gone, and it has to
   * carry the note saying what it is. Getting this the wrong way round left
   * the only off-machine copy as two unlabelled files. */
  const manifest = {
    at: at.toISOString(),
    database: new URL(url).pathname.replace(/^\//, ""),
    databaseDumpBytes: statSync(dump).size,
    uploadFiles: uploads.files,
    uploadBytes: uploads.bytes,
    pgDump: execFileSync(pgDump, ["--version"], { encoding: "utf8" }).trim(),
    copiedToRemovable: copiedTo,
    restoreWith:
      "pg_restore --clean --if-exists --no-owner -d <connection string> db.dump",
  };
  writeFileSync(path.join(here, "manifest.json"), JSON.stringify(manifest, null, 2));

  if (target && copiedTo) {
    cpSync(here, copiedTo, { recursive: true });
    prune(target);
  }

  prune(BACKUP_DIR);

  /* One file that always says what happened last, so "the drive has not been
   * plugged in for three weeks" is something anybody can see rather than
   * something they find out the day they need it. */
  writeFileSync(
    path.join(BACKUP_DIR, "last-run.json"),
    JSON.stringify({ ...manifest, removableDriveLabel: DRIVE_LABEL }, null, 2),
  );

  console.log(`backed up to ${here}`);
  console.log(
    copiedTo
      ? `copied to ${copiedTo}`
      : `WARNING: no drive labelled ${DRIVE_LABEL} was plugged in — this backup is only on the machine's own disk`,
  );
}

main();
