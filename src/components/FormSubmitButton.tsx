"use client";

import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { SpinnerIcon } from "@/components/icons";

/**
 * A submit button for a form it isn't inside — the Save that sits in a
 * dialog's footer and reaches its fields through `form={id}`.
 *
 * `SubmitButton` can't help there: `useFormStatus` reports the pending state
 * of an *ancestor* form only, so a footer button would render a spinner that
 * never spins. This one listens to the form's own submit event instead, which
 * fires wherever the button lives.
 *
 * No need to clear the flag: a server action ends in a redirect or a
 * re-render, and this component is mounted fresh either way.
 */
export function FormSubmitButton({
  formId,
  children,
  pendingLabel = "Saving…",
  disabled = false,
  ...props
}: Omit<ComponentProps<typeof Button>, "type" | "form"> & {
  formId: string;
  pendingLabel?: ReactNode;
}) {
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const form = document.getElementById(formId);
    if (!form) {
      return;
    }
    // Only a submit that actually proceeds counts: a field failing the
    // browser's own validation fires `invalid` and no submit at all, so the
    // button must not latch on a press that never left the page.
    const onSubmit = () => setPending(true);
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, [formId]);

  return (
    <Button type="submit" form={formId} disabled={disabled || pending} {...props}>
      {pending && <SpinnerIcon className="size-4 animate-spin" />}
      {pending ? pendingLabel : children}
    </Button>
  );
}
