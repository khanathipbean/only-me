"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button, IconButton, type ButtonVariant } from "@/components/ui/Button";
import { ClearIcon } from "@/components/icons";

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
        className="m-auto w-full max-w-2xl rounded-lg border border-border bg-surface p-0 text-foreground shadow-xl backdrop:bg-black/50 backdrop:backdrop-blur-sm"
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
