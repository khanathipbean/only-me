import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createModule } from "@/lib/modules";
import {
  canPreview,
  getFileKind,
  listProjectFilesByModule,
  previewMode,
  NO_MODULE_HEADING,
} from "@/lib/project-files";

/**
 * The classifier decides both the icon on a card and how the dialog draws the
 * file, and it has to work from what browsers actually report — which for an
 * upload is often `application/octet-stream` whatever the file really is.
 */
describe("project files", () => {
  it("reads the content type first and the extension when that says nothing", () => {
    expect(getFileKind("text/csv", "anything")).toBe("csv");
    expect(getFileKind("application/pdf", "anything")).toBe("pdf");
    expect(getFileKind("video/mp4", "anything")).toBe("video");
    expect(getFileKind("audio/mpeg", "anything")).toBe("audio");

    // The case that matters: a browser that gave up on the type.
    expect(getFileKind("application/octet-stream", "rows.csv")).toBe("csv");
    expect(getFileKind("application/octet-stream", "notes.md")).toBe("text");
    expect(getFileKind("application/octet-stream", "config.json")).toBe("text");
    expect(getFileKind("application/octet-stream", "clip.mp4")).toBe("video");
    expect(getFileKind("application/octet-stream", "who-knows.bin")).toBe("generic");
  });

  it("calls a .csv a table even when it arrives as plain text", () => {
    // `text/plain` is what several browsers report for a CSV. Reaching the
    // text branch first would show its commas instead of its columns.
    expect(getFileKind("text/plain", "rows.csv")).toBe("csv");
    expect(previewMode("text/plain", "rows.csv")).toBe("table");
  });

  it("draws text and tables without the server having to serve them inline", () => {
    /* The point of splitting `previewMode` from `canPreview`: these are read
     * from the blob and put in the DOM as characters, so they preview while
     * the server still sends them as downloads. */
    expect(canPreview("text/csv")).toBe(false);
    expect(previewMode("text/csv", "rows.csv")).toBe("table");

    expect(canPreview("text/markdown")).toBe(false);
    expect(previewMode("text/markdown", "notes.md")).toBe("text");
  });

  it("keeps SVG and office documents out of the preview", () => {
    /* SVG is XML that can carry script; rendering one inline would run it on
     * this app's origin. It is an image by content type, so the gate has to be
     * `canPreview`, not the kind. */
    expect(canPreview("image/svg+xml")).toBe(false);
    expect(previewMode("image/svg+xml", "logo.svg")).toBe("none");

    expect(previewMode("application/vnd.ms-excel", "book.xls")).toBe("none");
    expect(previewMode("application/msword", "letter.doc")).toBe("none");
  });

  it("still previews the two kinds the server sends inline", () => {
    expect(previewMode("application/pdf", "doc.pdf")).toBe("frame");
    expect(previewMode("image/png", "shot.png")).toBe("image");
  });
});

describe("project files by module", () => {
  async function seed(code: string) {
    const owner = await prisma.user.create({
      data: { email: `${code.toLowerCase()}@example.com`, passwordHash: "x", name: code },
    });
    const project = await prisma.project.create({
      data: { code, name: code, status: "ACTIVE", ownerId: owner.id },
    });
    const policy = await createModule(project.id, "Policy", owner.id);
    return { owner, project, policy };
  }

  async function addFile(
    projectId: string,
    uploadedById: string,
    fileName: string,
    mod: { id: string; name: string } | null,
  ) {
    return prisma.projectFile.create({
      data: {
        projectId,
        moduleId: mod?.id ?? null,
        module: mod?.name ?? NO_MODULE_HEADING,
        fileName,
        storageKey: `test/${fileName}-${Math.random()}`,
        contentType: "text/plain",
        size: 1,
        uploadedById,
      },
    });
  }

  it("groups files with no Module under their own heading, listed last", async () => {
    const { owner, project, policy } = await seed("PRJ-FILE-1");
    await addFile(project.id, owner.id, "terms.pdf", null);
    await addFile(project.id, owner.id, "policy-spec.pdf", policy);

    const groups = await listProjectFilesByModule(project.id);
    /* Real Modules first whatever they are called: files belonging to none
     * are the exception on the page and read as a footnote, not as something
     * sorted into the middle by its heading's spelling. */
    expect(groups.map((group) => group.module)).toEqual(["Policy", NO_MODULE_HEADING]);
    expect(groups[1].files.map((file) => file.fileName)).toEqual(["terms.pdf"]);
  });

  it("does not pour those files in with a Module that happens to be called the same", async () => {
    const { owner, project } = await seed("PRJ-FILE-2");
    // Keyed on the Module's id, not the heading text, so this is two groups.
    const named = await createModule(project.id, NO_MODULE_HEADING, owner.id);
    await addFile(project.id, owner.id, "really-in-a-module.pdf", named);
    await addFile(project.id, owner.id, "about-the-project.pdf", null);

    const groups = await listProjectFilesByModule(project.id);
    expect(groups).toHaveLength(2);
    expect(groups[0].files.map((file) => file.fileName)).toEqual(["really-in-a-module.pdf"]);
    expect(groups[1].files.map((file) => file.fileName)).toEqual(["about-the-project.pdf"]);
  });

  it("filters to the files with no Module, which an empty value cannot ask for", async () => {
    const { owner, project, policy } = await seed("PRJ-FILE-3");
    await addFile(project.id, owner.id, "terms.pdf", null);
    await addFile(project.id, owner.id, "policy-spec.pdf", policy);

    const none = await listProjectFilesByModule(project.id, { moduleId: "none" });
    expect(none.flatMap((group) => group.files).map((file) => file.fileName)).toEqual([
      "terms.pdf",
    ]);

    // An empty value still means "don't filter" — that is why `none` exists.
    const all = await listProjectFilesByModule(project.id, { moduleId: "" });
    expect(all.flatMap((group) => group.files)).toHaveLength(2);
  });
});
