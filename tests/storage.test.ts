import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { deleteFile, downloadFile, uploadFile } from "@/lib/storage";

/**
 * Keeping uploads on the machine that serves the app.
 *
 * Untestable while the only way to store a file was an account in another
 * country: every one of these would have needed a live bucket, so none of
 * them existed. The branch this covers is the one the office server runs on.
 */
describe("storing a file on disk", () => {
  let root: string;
  const before = process.env.UPLOAD_DIR;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "only-me-store-"));
    process.env.UPLOAD_DIR = root;
  });

  afterEach(async () => {
    if (before === undefined) {
      delete process.env.UPLOAD_DIR;
    } else {
      process.env.UPLOAD_DIR = before;
    }
    await rm(root, { recursive: true, force: true });
  });

  it("writes the bytes where the key says, and reads them back", async () => {
    await uploadFile("attachments/abc-123", Buffer.from("a screenshot"), "image/png");

    /* Read off the disk rather than through `downloadFile`, so this says
       where the file went and not merely that the pair agree with each
       other — a backup script has to be able to find these. */
    expect((await readFile(path.join(root, "attachments", "abc-123"))).toString()).toBe(
      "a screenshot",
    );
    expect((await downloadFile("attachments/abc-123")).toString()).toBe("a screenshot");
  });

  it("refuses to write over something already there", async () => {
    /* The Supabase branch passes `upsert: false`, and two uploads quietly
       becoming one is the kind of thing nobody notices until a file somebody
       needs holds somebody else's bytes. */
    await uploadFile("project-files/one", Buffer.from("first"), "text/plain");
    await expect(
      uploadFile("project-files/one", Buffer.from("second"), "text/plain"),
    ).rejects.toThrow();
    expect((await downloadFile("project-files/one")).toString()).toBe("first");
  });

  it("says so when the bytes are gone", async () => {
    /* What the pages above are written against: a file whose object has
       disappeared says so rather than offering a download that dies. */
    await expect(downloadFile("project-files/never-written")).rejects.toThrow();
  });

  it("deletes, and does not mind deleting twice", async () => {
    await uploadFile("project-files/two", Buffer.from("bytes"), "text/plain");
    await deleteFile("project-files/two");
    await expect(downloadFile("project-files/two")).rejects.toThrow();
    // Tidying up after a half-finished upload must not fail on the second go.
    await expect(deleteFile("project-files/two")).resolves.toBeUndefined();
  });

  it("refuses a key that would climb out of the store", async () => {
    /* No key this app writes looks like any of these — they are all
       `<folder>/<uuid>` with nothing of the uploader's in them. The guard is
       for the caller that has not been written yet. */
    const outside = path.join(root, "..", "escaped.txt");
    for (const key of ["../escaped.txt", "attachments/../../escaped.txt", "/etc/passwd"]) {
      await expect(uploadFile(key, Buffer.from("no"), "text/plain")).rejects.toThrow(/Refusing/);
      await expect(downloadFile(key)).rejects.toThrow(/Refusing/);
      await expect(deleteFile(key)).rejects.toThrow(/Refusing/);
    }
    await expect(readFile(outside)).rejects.toThrow();
  });

  it("refuses a Windows path, which resolve() would otherwise honour", async () => {
    /* `path.resolve(root, "C:\\Windows\\x")` returns the absolute path and
       forgets the root entirely, so the pattern has to catch this one before
       resolving gets a say. */
    await expect(
      uploadFile("C:\\Windows\\Temp\\x", Buffer.from("no"), "text/plain"),
    ).rejects.toThrow(/Refusing/);
  });

  it("keeps the folders a key names, so a backup can be read by eye", async () => {
    await uploadFile("avatars/someone", Buffer.from("png"), "image/png");
    await writeFile(path.join(root, "marker"), "x");
    expect((await readFile(path.join(root, "avatars", "someone"))).toString()).toBe("png");
  });
});
