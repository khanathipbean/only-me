import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "uploads";

/** The ceiling on anything a user uploads — project files and Test Case
 *  attachments alike. Declared here rather than in either uploader, since a
 *  limit that lives with one of them is a limit the other forgets. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/**
 * Where this install keeps uploads: a folder of its own, or Supabase.
 *
 * `UPLOAD_DIR` set means the files live on the machine serving the app, which
 * is what the server on the office network wants — the people uploading are
 * in the same room, and sending their screenshots to another continent and
 * back was the only reason this app needed an account anywhere. Unset keeps
 * the Supabase path exactly as it was, because the Netlify deployment has no
 * disk of its own to write to.
 *
 * Read per call rather than at module scope: the tests point it at a
 * throwaway directory, and a value captured at import time would be the one
 * from whichever test ran first.
 */
function localRoot(): string | null {
  const configured = process.env.UPLOAD_DIR?.trim();
  return configured ? path.resolve(configured) : null;
}

/** Lazy, not module-scope: the app (and its tests) can still start up
 * without these set — only an actual upload/download/delete needs them. */
function client() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to store files");
  }
  return createClient(url, serviceRoleKey);
}

/**
 * The key as a path inside the folder, refused if it could point outside it.
 *
 * Every key this app stores is `<folder>/<uuid>` and no part of it comes from
 * whoever did the uploading — `ProjectFile.storageKey` says so, and the
 * filename they chose is kept in a column nothing builds a path from. The
 * check is here anyway: this is a library function, the next caller is not
 * bound by what today's callers happen to pass, and "the key is always safe"
 * is the kind of thing that stays true until it does not.
 *
 * Both halves matter. The pattern refuses the obvious — a traversal, a drive
 * letter, a leading slash — and resolving against the root catches whatever
 * the pattern did not think of, because a path that climbed out does not
 * start with the root any more.
 */
function fileFor(root: string, key: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/.test(key)) {
    throw new Error(`Refusing a storage key that is not a plain path: ${key}`);
  }
  const full = path.resolve(root, key);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error(`Refusing a storage key that points outside the store: ${key}`);
  }
  return full;
}

export async function uploadFile(key: string, bytes: Buffer, contentType: string) {
  const root = localRoot();
  if (root) {
    const file = fileFor(root, key);
    await mkdir(path.dirname(file), { recursive: true });
    /* `wx` fails when the file is already there, which is the same promise
     * `upsert: false` makes below. Two uploads cannot quietly become one. */
    await writeFile(file, bytes, { flag: "wx" });
    /* The content type is not stored: nothing reads it back from here. Both
     * tables keep their own `contentType` column and the download routes
     * serve from that, so a second copy would only be a second answer. */
    return;
  }
  const { error } = await client().storage.from(BUCKET).upload(key, bytes, {
    contentType,
    upsert: false,
  });
  if (error) {
    throw error;
  }
}

/** Reads the bytes back. Resolves through the stored key only. */
export async function downloadFile(key: string): Promise<Buffer> {
  const root = localRoot();
  if (root) {
    /* Throws when the file is gone, which is what the Supabase branch does
     * too — and what the pages above are written against: a file whose
     * object has disappeared says so rather than offering a dead download. */
    return readFile(fileFor(root, key));
  }
  const { data, error } = await client().storage.from(BUCKET).download(key);
  if (error) {
    throw error;
  }
  return Buffer.from(await data.arrayBuffer());
}

export async function deleteFile(key: string) {
  const root = localRoot();
  if (root) {
    /* `force` so a key that is already gone is not an error — Supabase's
     * `remove` is quiet about that too, and a delete that fails because the
     * thing is already deleted would block tidying up after a half-finished
     * upload. */
    await rm(fileFor(root, key), { force: true });
    return;
  }
  const { error } = await client().storage.from(BUCKET).remove([key]);
  if (error) {
    throw error;
  }
}
