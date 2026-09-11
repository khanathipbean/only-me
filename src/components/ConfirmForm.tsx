"use client";

import { useRef, type FormEvent, type ReactNode } from "react";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { dialogClass } from "@/lib/ui";

/**
 * Wraps a server-action form with a styled confirmation dialog instead of
 * the native `window.confirm()` (which can't be styled at all). Submitting
 * the form opens the dialog; confirming re-submits the same form element
 * (via `requestSubmit`) so every field already inside it — e.g. a "Target
 * Project ID" input — is included, exactly as a native submit would.
 */
export function ConfirmForm({
  action,
  confirmMessage,
  variant = "primary",
  children,
}: {
  action: (formData: FormData) => void;
  confirmMessage: string;
  variant?: ButtonVariant;
  children: ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmedRef = useRef(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (!confirmedRef.current) {
      event.preventDefault();
      dialogRef.current?.showModal();
    }
  }

  function handleConfirm() {
    confirmedRef.current = true;
    dialogRef.current?.close();
    formRef.current?.requestSubmit();
  }

  return (
    <>
      <form ref={formRef} action={action} onSubmit={handleSubmit}>
        {children}
      </form>

      <dialog
        ref={dialogRef}
        className={`${dialogClass} max-w-sm`}
      >
        <div className="p-5">
          <p className="text-sm text-foreground">{confirmMessage}</p>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => dialogRef.current?.close()}>
              Cancel
            </Button>
            <Button type="button" variant={variant} onClick={handleConfirm}>
              Confirm
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
