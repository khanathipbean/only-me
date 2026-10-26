"use client";

import { useRef, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { dialogClass } from "@/lib/ui";

/**
 * Wraps a server-action form with a styled confirmation dialog instead of
 * the native `window.confirm()` (which can't be styled at all). Submitting
 * the form opens the dialog; confirming re-submits the same form element
 * (via `requestSubmit`) so every field already inside it — e.g. a "Target
 * Project ID" input — is included, exactly as a native submit would.
 */
/* Hydration, asked without an effect: the server snapshot is false and the
 * client snapshot is true, so this reads false through the render that has
 * to match the server's HTML and true from the next one on. */
const subscribeToNothing = () => () => {};
const onTheClient = () => true;
const onTheServer = () => false;

export function ConfirmForm({
  id,
  action,
  confirmMessage,
  variant = "primary",
  children,
}: {
  /** Lets inputs elsewhere on the page join this form via `form={id}`,
   *  instead of being nested inside it — needed wherever the fields (e.g. a
   *  bulk-select checkbox column) can't sit inside this form's own children
   *  without illegally nesting it inside another form already on the page. */
  id?: string;
  action: (formData: FormData) => void;
  confirmMessage: string;
  variant?: ButtonVariant;
  children: ReactNode;
}) {
  /* Nothing inside here may be pressed until this component is running.
   *
   * A Next server-action form posts without JavaScript — that is the point
   * of them — while the confirmation lives in `onSubmit`, which exists only
   * once React has hydrated. Press the button inside that window and the
   * action runs with nothing asked. It was unreachable while every one of
   * these sat inside a modal that JavaScript had to open; the moment one was
   * put in a table row it became a real click, and the e2e suite found it by
   * deleting the account the other specs sign in as.
   *
   * Disabled rather than caught on the server, which cannot tell a press
   * that skipped the question from one that answered it. */
  const ready = useSyncExternalStore(subscribeToNothing, onTheClient, onTheServer);
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
      <form id={id} ref={formRef} action={action} onSubmit={handleSubmit}>
        {/* `contents` so the guard changes what can be pressed and nothing
            about how the children are laid out. */}
        <fieldset disabled={!ready} className="contents">
          {children}
        </fieldset>
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
