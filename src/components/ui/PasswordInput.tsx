"use client";

import { useState, type InputHTMLAttributes } from "react";
import { EyeIcon, EyeOffIcon } from "@/components/icons";
import { inputWithTrailingButtonClass } from "@/lib/ui";

/**
 * Password field with a show/hide toggle.
 *
 * A client component because the login page it sits on is a server component
 * and the toggle is pure client state — nothing about it needs to reach the
 * server, and the surrounding form stays an uncontrolled server-action form.
 *
 * The button is `type="button"` so it can't submit that form, and it keeps its
 * own accessible name (the icon alone carries none) which changes with the
 * state, so a screen reader hears what the next press will do.
 */
export function PasswordInput({
  inputClassName = inputWithTrailingButtonClass,
  toggleClassName = "text-muted hover:text-foreground focus-visible:ring-brand",
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className"> & {
  /** Replaces the default field styling outright rather than appending to it:
   * two classes for the same property (`bg-surface` and `bg-white/10`, say)
   * don't reliably override each other — Tailwind's emit order decides. */
  inputClassName?: string;
  /** Colours for the toggle, so a field on a dark backdrop can light it up. */
  toggleClassName?: string;
}) {
  const [visible, setVisible] = useState(false);
  const label = visible ? "Hide password" : "Show password";

  return (
    <div className="relative">
      <input {...props} type={visible ? "text" : "password"} className={inputClassName} />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        aria-label={label}
        aria-pressed={visible}
        title={label}
        className={`absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md transition-colors focus-visible:ring-1 focus-visible:outline-none ${toggleClassName}`}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}
