"use client";

import { useCallback, useState, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";
import { SpinnerIcon } from "@/components/icons";

/**
 * A submit button that disables itself and shows a spinner while its form's
 * action is running — otherwise a slow sign-in (or any server action) leaves
 * the button looking clickable, and an impatient second click re-submits.
 *
 * Has to be its own client component: `useFormStatus` only reads the
 * enclosing form's pending state from a descendant, never from the form
 * element itself, so it can't just live inline in a server-rendered page.
 */
export function SubmitButton({
  children,
  pendingLabel = "Saving…",
  disabled = false,
  ...props
}: Omit<ComponentProps<typeof Button>, "type"> & { pendingLabel?: ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={disabled || pending} {...props}>
      {pending && <SpinnerIcon className="size-4 animate-spin" />}
      {pending ? pendingLabel : children}
    </Button>
  );
}

/** Whether anything in the form has been moved off what the server sent.
 *
 * Compared against `defaultChecked`/`defaultValue`, which are the HTML
 * attributes the server rendered — no snapshot to take on mount and nothing
 * to keep in step. Ticking a box and unticking it again lands back on the
 * server's own value, so the form is clean again, which is the honest answer.
 */
function differsFromServer(form: HTMLFormElement) {
  return Array.from(form.elements).some((element) => {
    if (!(element instanceof HTMLInputElement)) {
      return false;
    }
    if (element.type === "checkbox" || element.type === "radio") {
      return element.checked !== element.defaultChecked;
    }
    return element.value !== element.defaultValue;
  });
}

/**
 * A Save button that stays disabled until there is something to save.
 *
 * On a page of forty checkboxes, a Save that is always live invites a
 * pointless round trip and makes "did I change anything?" a question the
 * page refuses to answer. This answers it: the button lights up when
 * something differs from what the server sent, and goes dark again if it is
 * put back.
 *
 * The wrapper is only somewhere to hang a ref — `contents` so it changes
 * nothing about the layout. A ref callback rather than an effect: it
 * subscribes to the form on mount and unsubscribes on the cleanup React
 * calls, and the lint here forbids setting state in an effect body anyway.
 */
export function SubmitWhenChanged({
  children,
  ...props
}: ComponentProps<typeof SubmitButton>) {
  const [changed, setChanged] = useState(false);

  const watchTheForm = useCallback((node: HTMLDivElement | null) => {
    const form = node?.closest("form");
    if (!form) {
      return;
    }
    const update = () => setChanged(differsFromServer(form));
    form.addEventListener("change", update);
    return () => form.removeEventListener("change", update);
  }, []);

  return (
    <div ref={watchTheForm} className="contents">
      <SubmitButton disabled={!changed} {...props}>
        {children}
      </SubmitButton>
    </div>
  );
}

/**
 * The same guard for a submit control that isn't a `Button` — the test group
 * reorder arrows, the Log out item in the account menu. It keeps whatever
 * classes the caller gives it and only adds the disabled state, since these
 * are too small for a spinner to fit in.
 *
 * Worth having on the arrows in particular: two quick clicks would move a row
 * twice, and the second move is against an order the first one already
 * changed.
 */
export function SubmitAction({
  children,
  pendingChildren,
  ...props
}: Omit<ComponentProps<"button">, "type" | "disabled"> & { pendingChildren?: ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} aria-busy={pending} {...props}>
      {pending ? (pendingChildren ?? children) : children}
    </button>
  );
}
