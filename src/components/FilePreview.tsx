"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Dialog } from "@/components/ui/Modal";
import { Button, LinkButton } from "@/components/ui/Button";
import {
  FileCsvIcon,
  FileExcelIcon,
  FileIcon,
  FileImageIcon,
  FilePdfIcon,
  FileWordIcon,
} from "@/components/icons";
import type { FileKind } from "@/lib/project-files";

export type ProjectFileCard = {
  id: string;
  fileName: string;
  uploadedAt: string;
  size: number;
  href: string;
  previewable: boolean;
  isImage: boolean;
  kind: FileKind;
};

/** Colour carries the type at a glance, the way Drive/Office icons do; the
 * glyph alone still reads fine without it. */
const KIND_ICON: Record<FileKind, { Icon: typeof FileIcon; className: string }> = {
  pdf: { Icon: FilePdfIcon, className: "text-red-600 dark:text-red-400" },
  word: { Icon: FileWordIcon, className: "text-blue-600 dark:text-blue-400" },
  excel: { Icon: FileExcelIcon, className: "text-green-600 dark:text-green-400" },
  csv: { Icon: FileCsvIcon, className: "text-green-600 dark:text-green-400" },
  image: { Icon: FileImageIcon, className: "text-purple-600 dark:text-purple-400" },
  generic: { Icon: FileIcon, className: "text-muted" },
};

const NOTICE_CLASS =
  "rounded-md border border-border bg-black/[.02] px-3 py-4 text-sm text-muted dark:bg-white/[.03]";

const MISSING_CLASS =
  "rounded-md border border-amber-500/30 bg-amber-50 px-3 py-4 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200";

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
 *
 * The bytes are fetched when the dialog opens instead of being left to an
 * `<img>` or `<iframe>` to pull in. A row whose object is no longer in
 * storage answers 410, and pointed straight at a frame that JSON error
 * rendered as the preview — and the Download button handed the same JSON to
 * the browser as a page. The app has files in exactly that state: the storage
 * key layout changed twice and the old rows were never migrated.
 */
type Fetched =
  | { status: "loading" }
  /** The object is there. `url` is a blob of it, so the preview and the
   *  original request aren't two trips down the wire. */
  | { status: "ready"; url: string }
  /** 410 — the row is still here, the bytes are not. */
  | { status: "missing" }
  | { status: "error"; message: string };

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
  const [fetched, setFetched] = useState<Fetched>({ status: "loading" });
  const { Icon, className: iconClassName } = KIND_ICON[file.kind];

  useEffect(() => {
    if (!open) {
      return;
    }
    let url: string | null = null;
    let cancelled = false;

    (async () => {
      setFetched({ status: "loading" });
      try {
        const response = await fetch(file.href);
        if (!response.ok) {
          // 410 is the one the server means: the record exists and its object
          // does not. Anything else is a fault worth showing as one.
          setFetched(
            response.status === 410
              ? { status: "missing" }
              : { status: "error", message: `The server answered ${response.status}.` },
          );
          return;
        }
        const blob = await response.blob();
        if (cancelled) {
          return;
        }
        url = URL.createObjectURL(blob);
        setFetched({ status: "ready", url });
      } catch {
        if (!cancelled) {
          setFetched({ status: "error", message: "The file could not be reached." });
        }
      }
    })();

    return () => {
      cancelled = true;
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [open, file.href]);

  return (
    <>
      <div className="group relative rounded-lg border border-border bg-surface transition-colors hover:border-brand">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-start gap-3 rounded-lg p-3 pr-11 text-left transition-colors hover:bg-black/[.02] dark:hover:bg-white/[.04]"
        >
          <Icon className={`mt-0.5 size-5 shrink-0 ${iconClassName}`} />
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
          {fetched.status === "loading" && (
            <p className={NOTICE_CLASS}>Loading…</p>
          )}

          {fetched.status === "missing" && (
            <p role="alert" className={MISSING_CLASS}>
              This file is no longer in storage. The record is still here, but the bytes
              behind it are gone — it will have to be uploaded again.
            </p>
          )}

          {fetched.status === "error" && (
            <p role="alert" className={MISSING_CLASS}>
              {fetched.message} Try again in a moment.
            </p>
          )}

          {fetched.status === "ready" &&
            (file.previewable ? (
            file.isImage ? (
              /* A plain <img>, not next/image: the source is an
                 authenticated route whose dimensions aren't known ahead of
                 time, and routing a private document through the image
                 optimiser would cache it outside the permission check. */
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={fetched.url}
                alt={file.fileName}
                className="max-h-[70vh] w-full rounded-md object-contain"
              />
            ) : (
              <iframe
                src={fetched.url}
                title={file.fileName}
                className="h-[70vh] w-full rounded-md border border-border bg-white"
              />
            )
          ) : (
            <p className={NOTICE_CLASS}>
              This file type can&apos;t be shown here. Download it to open it in the right
              application.
            </p>
          ))}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Close
            </Button>
            {/* No point offering a download that can only answer 410. */}
            {fetched.status !== "missing" && (
              <LinkButton href={file.href} download={file.fileName}>
                Download
              </LinkButton>
            )}
          </div>
        </div>
      </Dialog>
    </>
  );
}
