"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button, IconButton, type ButtonVariant } from "@/components/ui/Button";
import { ClearIcon } from "@/components/icons";
import { dialogClass } from "@/lib/ui";

/**
 * The `<dialog>` itself, with no opinion about what opens it.
 *
 * Split out from `Modal` so a caller that already owns a control — the row
 * actions menu, say — can reuse the same chrome instead of copying its
 * classes. It's driven by a boolean rather than a ref because a render prop
 * can't cross the server/client boundary, so the opener has to live in the
 * same client component as its state.
 */
/** Widths a dialog can take. A fixed set rather than a class the caller
 * appends: two `max-w-*` utilities resolve by Tailwind's emit order, so
 * `${dialogClass} max-w-5xl` would be a coin toss against the built-in one. */
const DIALOG_WIDTH_CLASS = {
  md: "max-w-2xl",
  /** For content that needs room to be legible — a PDF page, say. */
  lg: "max-w-5xl",
  /** Nearly the whole window, for a document you actually have to read.
   * `95vw` rather than a rem cap so it fills a wide monitor too. */
  full: "max-w-[95vw]",
} as const;

export function Dialog({
  open,
  onClose,
  title,
  width = "md",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  width?: keyof typeof DIALOG_WIDTH_CLASS;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      // Esc and the backdrop close the dialog natively; `close` keeps the
      // caller's state in step with what the browser already did.
      onClose={onClose}
      className={`${dialogClass} ${DIALOG_WIDTH_CLASS[width]}`}
    >
      <div className="max-h-[85vh] overflow-y-auto p-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <IconButton type="button" onClick={onClose} aria-label="Close" title="Close">
            <ClearIcon />
          </IconButton>
        </div>
        {children}
      </div>
    </dialog>
  );
}

/**
 * A trigger button that opens its children in a styled `<dialog>` modal,
 * instead of navigating to a separate page. `openOnMount` lets a caller
 * reopen the modal automatically after a server-action redirect carries an
 * error back to this same page (e.g. `?error=...`).
 */
export function Modal({
  triggerLabel,
  triggerVariant = "primary",
  triggerIcon,
  title,
  openOnMount,
  children,
}: {
  triggerLabel: string;
  triggerVariant?: ButtonVariant;
  /** Renders instead of the visible `triggerLabel` text; `triggerLabel` still becomes the button's accessible name. */
  triggerIcon?: ReactNode;
  title: string;
  openOnMount?: boolean;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (openOnMount) {
      dialogRef.current?.showModal();
    }
  }, [openOnMount]);

  return (
    <>
      {triggerIcon ? (
        <IconButton
          type="button"
          variant={triggerVariant}
          onClick={() => dialogRef.current?.showModal()}
          aria-label={triggerLabel}
          title={triggerLabel}
        >
          {triggerIcon}
        </IconButton>
      ) : (
        <Button type="button" variant={triggerVariant} onClick={() => dialogRef.current?.showModal()}>
          {triggerLabel}
        </Button>
      )}

      <dialog
        ref={dialogRef}
        className={`${dialogClass} max-w-2xl`}
      >
        <div className="max-h-[85vh] overflow-y-auto p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <IconButton
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label="Close"
              title="Close"
            >
              <ClearIcon />
            </IconButton>
          </div>
          {children}
        </div>
      </dialog>
    </>
  );
}
