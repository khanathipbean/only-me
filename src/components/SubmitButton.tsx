"use client";

import type { ComponentProps, ReactNode } from "react";
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
