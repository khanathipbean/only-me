"use client";

import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { ChevronRightIcon } from "@/components/icons";

export type SelectOption = { value: string; label: string };

/**
 * A dropdown with an option list we actually control. A native `<select>`
 * hands its open list to the OS, so its corners, row height and highlight
 * can't be reached from CSS at all.
 *
 * When `name` is given, the submitted control is a real (visually hidden)
 * `<select>` rather than a hidden `<input>`. That matters for two reasons:
 * `required` still participates in constraint validation (hidden inputs are
 * barred from it), and the change event it dispatches genuinely comes from a
 * SELECT — which is exactly what FilterForm keys off to apply filters
 * immediately, so that stays working untouched. It's positioned over the same
 * box as the trigger (not `display: none`) so a browser's "please select an
 * item" bubble still has somewhere to point.
 */
export function Select({
  options,
  value,
  defaultValue,
  onChange,
  name,
  required,
  ariaLabel,
  className = "",
}: {
  options: SelectOption[];
  /** Controlled mode. Omit to let the component own the value. */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Renders the hidden native select, so the value takes part in form submit. */
  name?: string;
  required?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue ?? options[0]?.value ?? "");
  const selected = isControlled ? value : internalValue;

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const nativeRef = useRef<HTMLSelectElement>(null);
  const listboxId = useId();

  const selectedIndex = Math.max(
    options.findIndex((option) => option.value === selected),
    0,
  );
  const selectedLabel = options[selectedIndex]?.label ?? "";

  function commit(next: string) {
    if (!isControlled) {
      setInternalValue(next);
    }
    // The hidden select is uncontrolled, so assigning straight to `.value` is
    // safe (React isn't tracking it) — then a bubbling change event lets any
    // ancestor form react exactly as it would to a native select.
    const native = nativeRef.current;
    if (native && native.value !== next) {
      native.value = next;
      native.dispatchEvent(new Event("change", { bubbles: true }));
    }
    onChange?.(next);
    close();
  }

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function openList() {
    setActiveIndex(selectedIndex);
    setOpen(true);
  }

  // A form reset (FilterForm's "Clear filters" calls form.reset()) restores the
  // hidden native select to its defaultValue, but nothing would tell our own
  // state — the trigger would keep showing the cleared filter's label. The
  // reset event fires *before* the browser restores values, so read it back on
  // the next frame rather than synchronously.
  useEffect(() => {
    const native = nativeRef.current;
    const form = native?.form;
    if (!form || isControlled) {
      return;
    }
    function onReset() {
      requestAnimationFrame(() => setInternalValue(native?.value ?? ""));
    }
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [isControlled]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  // Move focus onto the list when it opens, so the arrow keys reach its own
  // key handler rather than staying on the trigger, and keep the active row in
  // view while arrowing through a long list.
  useEffect(() => {
    if (!open) {
      return;
    }
    if (document.activeElement !== listRef.current) {
      listRef.current?.focus();
    }
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  function onTriggerKeyDown(event: ReactKeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openList();
    }
  }

  function onListKeyDown(event: ReactKeyboardEvent) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, options.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (options[activeIndex]) {
          commit(options[activeIndex].value);
        }
        break;
      case "Escape":
        event.preventDefault();
        close();
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        // Typeahead: jump to the first option starting with the typed letter.
        if (event.key.length === 1) {
          const match = options.findIndex((option) =>
            option.label.toLowerCase().startsWith(event.key.toLowerCase()),
          );
          if (match >= 0) {
            setActiveIndex(match);
          }
        }
    }
  }

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      {name && (
        <select
          ref={nativeRef}
          name={name}
          required={required}
          defaultValue={selected}
          aria-hidden="true"
          tabIndex={-1}
          className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
        >
          {/* A required select needs a matching empty option for an unset
              value to actually count as invalid. */}
          {!options.some((option) => option.value === "") && <option value="" />}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}

      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onTriggerKeyDown}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-surface py-2 pr-2.5 pl-3 text-left text-sm text-foreground shadow-sm transition-colors outline-none hover:bg-black/[.02] focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand dark:hover:bg-white/[.04]"
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronRightIcon className="size-3.5 shrink-0 rotate-90 text-muted" />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={`${listboxId}-${activeIndex}`}
          onKeyDown={onListKeyDown}
          className="absolute z-20 mt-1 max-h-60 w-full min-w-max overflow-auto rounded-md border border-border bg-surface py-1 shadow-lg outline-none"
        >
          {options.map((option, index) => {
            const isSelected = option.value === selected;
            const isActive = index === activeIndex;
            return (
              <li
                key={option.value}
                id={`${listboxId}-${index}`}
                role="option"
                aria-selected={isSelected}
                data-index={index}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commit(option.value)}
                className={`cursor-pointer px-3 py-1.5 text-sm whitespace-nowrap ${
                  isSelected ? "font-medium text-brand" : "text-foreground"
                } ${isActive ? "bg-black/[.05] dark:bg-white/[.08]" : ""}`}
              >
                {option.label}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
