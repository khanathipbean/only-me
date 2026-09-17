import { createClient } from "@supabase/supabase-js";

const BUCKET = "uploads";

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

export async function uploadFile(key: string, bytes: Buffer, contentType: string) {
  const { error } = await client().storage.from(BUCKET).upload(key, bytes, {
    contentType,
    upsert: false,
  });
  if (error) {
    throw error;
  }
}

/** Reads the bytes back. Resolves through the stored key only. */
/** The ceiling on anything a user uploads — project files and Test Case
 *  attachments alike. Declared here rather than in either uploader, since a
 *  limit that lives with one of them is a limit the other forgets. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export async function downloadFile(key: string): Promise<Buffer> {
  const { data, error } = await client().storage.from(BUCKET).download(key);
  if (error) {
    throw error;
  }
  return Buffer.from(await data.arrayBuffer());
}

export async function deleteFile(key: string) {
  const { error } = await client().storage.from(BUCKET).remove([key]);
  if (error) {
    throw error;
  }
}
