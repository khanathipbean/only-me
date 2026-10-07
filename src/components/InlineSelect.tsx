"use client";

import { useRef } from "react";
import { Select, type SelectOption } from "@/components/ui/Select";

/**
 * A Select that saves the moment it is changed.
 *
 * The list showed a case's result and status as badges, and changing either
 * meant opening the row's Edit dialog, finding the field among a dozen
 * others, and saving the whole case. For the two fields that change most
 * often — a result after a test, a status when a case is finished — that is
 * five interactions for one decision.
 *
 * There is no Save button on purpose: one would sit unpressed down a long
 * list, and a row left looking changed but unsaved is worse than either
 * state. The trade is that a mis-click writes immediately; both fields are a
 * fixed set of values, the previous one is a click away, and every change is
 * in the audit log.
 */
export function InlineSelect({
  action,
  name,
  defaultValue,
  options,
  ariaLabel,
  className = "",
}: {
  /** A server action taking this one field. */
  action: (formData: FormData) => void | Promise<void>;
  name: string;
  defaultValue: string;
  options: SelectOption[];
  /** Required: the column heading is not read out with the control, so
   *  without this it announces only its value. */
  ariaLabel: string;
  className?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action}>
      <Select
        name={name}
        defaultValue={defaultValue}
        options={options}
        ariaLabel={ariaLabel}
        autoWidth
        className={className}
        /* requestSubmit rather than submit: it runs the form's own submit
           path, which is what React's action is attached to. */
        onChange={() => formRef.current?.requestSubmit()}
      />
    </form>
  );
}
