"use client";

import { useState, type ReactNode } from "react";
import { Dialog } from "@/components/ui/Modal";
import { Button, LinkButton } from "@/components/ui/Button";
import { FileIcon } from "@/components/icons";

export type ProjectFileCard = {
  id: string;
  fileName: string;
  uploadedAt: string;
  size: number;
  href: string;
  previewable: boolean;
  isImage: boolean;
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * A file card that opens a preview.
 *
 * Only the types the server is willing to send inline are previewed here; for
 * anything else the dialog says so and offers the download instead, rather
 * than showing an empty frame the browser was never going to fill.
 */
export function FilePreview({
  file,
  deleteSlot,
}: {
  file: ProjectFileCard;
  /** Rendered in the card's top-right corner. A sibling of the open-preview
   * button, never inside it: a button nested in a button is invalid HTML and
   * browsers drop the inner one. */
  deleteSlot?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="group relative rounded-lg border border-border bg-surface transition-colors hover:border-brand">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-start gap-3 rounded-lg p-3 pr-11 text-left transition-colors hover:bg-black/[.02] dark:hover:bg-white/[.04]"
        >
          <FileIcon className="mt-0.5 size-5 shrink-0 text-muted" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-foreground">
              {file.fileName}
            </span>
            <span className="mt-0.5 block text-xs text-muted">
              {file.uploadedAt} · {formatSize(file.size)}
            </span>
          </span>
        </button>

        {/* Quiet until you look for it: this deletes, and it shouldn't be the
            loudest thing on a page of documents. `pr-11` above keeps a long
            filename from running underneath it. */}
        {deleteSlot && <div className="absolute top-1.5 right-1.5">{deleteSlot}</div>}
      </div>

      {/* Wide: a PDF page at readable zoom needs more than the default. */}
      <Dialog open={open} onClose={() => setOpen(false)} title={file.fileName} width="full">
        <div className="flex flex-col gap-4">
          {/* 70vh, not more: the dialog's own body is capped at 85vh and also
              holds the title row, padding and the buttons below. Asking for
              80 pushed the total past the cap, so the body grew its own
              scrollbar and clipped the document. */}
          {file.previewable ? (
            file.isImage ? (
              /* A plain <img>, not next/image: the source is an
                 authenticated route whose dimensions aren't known ahead of
                 time, and routing a private document through the image
                 optimiser would cache it outside the permission check. */
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={file.href}
                alt={file.fileName}
                className="max-h-[70vh] w-full rounded-md object-contain"
              />
            ) : (
              <iframe
                src={file.href}
                title={file.fileName}
                className="h-[70vh] w-full rounded-md border border-border bg-white"
              />
            )
          ) : (
            <p className="rounded-md border border-border bg-black/[.02] px-3 py-4 text-sm text-muted dark:bg-white/[.03]">
              This file type can&apos;t be shown here. Download it to open it in the right
              application.
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Close
            </Button>
            <LinkButton href={file.href} download={file.fileName}>
              Download
            </LinkButton>
          </div>
        </div>
      </Dialog>
    </>
  );
}
