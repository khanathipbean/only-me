"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarIcon } from "@/components/icons";

/**
 * A date-and-time field dressed as one of this app's controls.
 *
 * Still a native `<input type="datetime-local">` underneath, and deliberately
 * so. A hand-written picker would have to reimplement the segment editing,
 * the arrow keys, the locale's field order and the platform's own calendar —
 * all of which this already has, in whatever language the reader's machine is
 * set to. What it lacks is a look that matches the fields beside it, so that
 * is all this adds: the calendar mark at the left, a chevron at the right
 * where every other control in this app keeps one, and a sentence instead of
 * `mm/dd/yyyy --:-- --` while the field is empty.
 *
 * The time is kept. The Audit Trail reads these as exact moments — a filter
 * for "after 14:30 yesterday" is a question people really ask of a log — so
 * this dresses the control without narrowing what it can say.
 *
 * Uncontrolled, like every other field in a filter form: `name` and
 * `defaultValue` are what the form reads, and `FilterForm` applies a
 * `datetime-local` change the moment it happens.
 */
export function DateTimeField({
  name,
  defaultValue,
  hint,
  label,
  className = "",
}: {
  name: string;
  defaultValue?: string;
  /** What stands in the field's middle while it is empty — "Select end
   *  date", not a format mask. */
  hint: string;
  /** Named for a screen reader, since the hint is drawn rather than typed
   *  and the visible label belongs to the `<label>` around this. */
  label: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [empty, setEmpty] = useState(!defaultValue);
  const [focused, setFocused] = useState(false);

  /* The hint gives way as soon as the field is in use: the segments a reader
     is typing into have to be visible, mask and all. */
  const showHint = empty && !focused;

  /* Kept in step with the field itself, after every render.
   *
   * The obvious version of this — listen for the form's `reset` and read the
   * value then — is wrong, and measurably so. "Clear filters" calls
   * `form.reset()`, and a reset restores a field's *default* value, which
   * here is whatever the URL already held: the listener fired and read back
   * the very moment it was meant to be clearing. The empty value arrives a
   * beat later, when the navigation lands and the page re-renders with no
   * `from` in the query — and no event announces that at all.
   *
   * So the DOM is the source of truth and this reads it whenever React has
   * finished with it. `setEmpty` with the value it already holds bails out
   * without re-rendering, so running on every render costs nothing and
   * cannot loop.
   */
  useEffect(() => {
    setEmpty(!inputRef.current?.value);
  });

  function openPicker() {
    const input = inputRef.current;
    if (!input) {
      return;
    }
    /* Not in every browser, and older ones throw rather than ignore it.
       Focusing is the honest fallback: the reader can then type, or press
       the key their platform opens the calendar with. */
    input.focus();
    try {
      input.showPicker?.();
    } catch {
      /* A browser that will not open it on our say-so. The field still
         works. */
    }
  }

  return (
    <span
      className={`relative flex items-center rounded-md border border-border bg-surface shadow-sm transition-colors focus-within:border-brand focus-within:ring-1 focus-within:ring-brand ${className}`}
    >
      <CalendarIcon className="pointer-events-none absolute left-3 size-4 text-muted" />

      {/* For the eye only. A field with nothing in it already announces as
          empty, and its name is on the input itself — a second copy of the
          sentence would be read out as content the field does not hold. */}
      {showHint && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-9 text-sm text-muted"
        >
          {hint}
        </span>
      )}

      <input
        ref={inputRef}
        type="datetime-local"
        name={name}
        defaultValue={defaultValue}
        aria-label={label}
        onInput={(event) => setEmpty(!event.currentTarget.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        /* `date-field-bare` drops the browser's own calendar button, which
           would otherwise sit beside ours. See globals.css. */
        className={`date-field-bare w-full appearance-none bg-transparent py-2 pr-9 pl-9 text-sm outline-none ${
          showHint ? "text-transparent" : "text-foreground"
        }`}
      />
      <button
        type="button"
        /* Inside a `<label>` that wraps the input: a click here would
           otherwise be forwarded to the input as a label activation as well,
           and the picker would be asked to open twice. */
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          openPicker();
        }}
        aria-label={`${label}: open the calendar`}
        className="absolute right-0 flex h-full items-center px-3 text-muted transition-colors hover:text-foreground"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="size-4"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
    </span>
  );
}
