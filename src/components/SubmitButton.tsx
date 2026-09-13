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
  ...props
}: Omit<ComponentProps<typeof Button>, "type" | "disabled"> & { pendingLabel?: ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending && <SpinnerIcon className="size-4 animate-spin" />}
      {pending ? pendingLabel : children}
    </Button>
  );
}
