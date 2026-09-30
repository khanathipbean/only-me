import { describe, expect, it } from "vitest";
import { canPreview, getFileKind, previewMode } from "@/lib/project-files";

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
