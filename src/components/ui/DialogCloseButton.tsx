"use client";

import type { MouseEvent, ReactNode } from "react";
import { Button } from "@/components/ui/Button";

/**
 * Cancel for a form that lives inside a `<dialog>`.
 *
 * The forms it sits in are server components rendered as `Modal`'s children,
 * so they can't be handed a close callback. Walking up from the clicked button
 * to the nearest `<dialog>` keeps them oblivious to whether they're in a modal
 * at all — and the same button still means something on the standalone
 * new/edit pages, where there is no dialog and going back is the sensible
 * equivalent of cancelling.
 */
export function DialogCloseButton({ children = "Cancel" }: { children?: ReactNode }) {
  function cancel(event: MouseEvent<HTMLButtonElement>) {
    const dialog = event.currentTarget.closest("dialog");
    if (dialog instanceof HTMLDialogElement) {
      dialog.close();
    } else {
      history.back();
    }
  }

  return (
    <Button type="button" variant="secondary" onClick={cancel}>
      {children}
    </Button>
  );
}
