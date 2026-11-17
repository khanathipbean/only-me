import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

/**
 * Bring the files down from Supabase onto the disk this install now serves from.
 *
 * A one-way move, run once when the storage account came back: every key the
 * database names is fetched and written under `UPLOAD_DIR`, where
 * `src/lib/storage.ts` will look for it from now on. Nothing in Supabase is
 * touched — the bucket stays exactly as it is, so a key that fails here can be
 * fetched again, and the old account remains a fallback until somebody decides
 * otherwise.
 *
 * Safe to run more than once. A key whose bytes are already on disk is skipped
 * rather than overwritten, so a run that died halfway can simply be repeated,
 * and a second run after new uploads will not clobber them.
 */

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });

import { PrismaPg } from "@prisma/adapter-pg";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@/generated/prisma/client";

const BUCKET = "uploads";

async function main() {
  const root = process.env.UPLOAD_DIR?.trim();
  if (!root) {
    throw new Error("UPLOAD_DIR is not set — there is nowhere to put the files");
  }
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to read the bucket");
  }

  const store = path.resolve(root);
  const supabase = createClient(url, serviceRoleKey);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 }),
  });

  /* Every column that names bytes in storage. Listing the bucket instead
   * would also pull orphans — objects no row points at any more — and those
   * are not what this install needs to keep working. */
  const [files, attachments, users] = await Promise.all([
    prisma.projectFile.findMany({ select: { storageKey: true } }),
    prisma.attachment.findMany({ select: { storageKey: true } }),
    prisma.user.findMany({ where: { avatarKey: { not: null } }, select: { avatarKey: true } }),
  ]);
  const keys = [
    ...files.map((row) => row.storageKey),
    ...attachments.map((row) => row.storageKey),
    ...users.map((row) => row.avatarKey!),
  ];

  let pulled = 0;
  let skipped = 0;
  const failed: { key: string; why: string }[] = [];

  for (const key of keys) {
    const destination = path.resolve(store, key);
    if (existsSync(destination)) {
      skipped += 1;
      continue;
    }
    const { data, error } = await supabase.storage.from(BUCKET).download(key);
    if (error || !data) {
      failed.push({ key, why: error?.message ?? "no bytes came back" });
      continue;
    }
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, Buffer.from(await data.arrayBuffer()));
    pulled += 1;
  }

  console.log(`keys the database names: ${keys.length}`);
  console.log(`  pulled down:           ${pulled}`);
  console.log(`  already on disk:       ${skipped}`);
  console.log(`  failed:                ${failed.length}`);
  for (const { key, why } of failed) {
    console.log(`    ${key} — ${why}`);
  }

  await prisma.$disconnect();
  /* A non-zero exit so a failure is visible to whoever ran this, rather than
   * being a line of output they have to notice. */
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

void main();
