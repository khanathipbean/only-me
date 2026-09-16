"use client";

import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  disabled,
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
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue ?? options[0]?.value ?? "");
  const selected = isControlled ? value : internalValue;

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [listBox, setListBox] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    above: boolean;
  } | null>(null);
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);

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
    setListBox(null);
    setPortalTarget(null);
    triggerRef.current?.focus();
  }

  function openList() {
    setActiveIndex(selectedIndex);
    const trigger = triggerRef.current;
    if (trigger) {
      const rect = trigger.getBoundingClientRect();
      // Portals out to `<body>` (or the nearest open `<dialog>`) rather than
      // sitting `absolute` inside the trigger's own wrapper: a wrapper inside
      // a dialog clips its own overflow, so a list that opens near the bottom
      // of one got cut short and needed its own internal scroll to reach the
      // rest — the same fix `Tooltip` needed for the same reason.
      const target = trigger.closest("dialog") ?? document.body;
      const containingRect =
        target === document.body
          ? { top: 0, left: 0, bottom: window.innerHeight }
          : target.getBoundingClientRect();

      // Clamped to whichever box it's confined to, rather than letting it
      // extend past that box's own edge on a fixed `max-h-60`: a `position:
      // fixed` descendant still counts toward a filter/backdrop-filter
      // ancestor's own scrollable area (the same reason a dialog needed the
      // portal in the first place), so one left to overflow the dialog made
      // the DIALOG grow a phantom scrollbar with nothing below it to reach.
      const GAP = 4;
      const rowHeightEstimate = 34;
      const wantedHeight = Math.min(240, options.length * rowHeightEstimate + 8);
      const spaceBelow = containingRect.bottom - rect.bottom - GAP;
      const spaceAbove = rect.top - containingRect.top - GAP;
      const above = spaceBelow < wantedHeight && spaceAbove > spaceBelow;
      const maxHeight = Math.max(80, Math.min(240, above ? spaceAbove : spaceBelow));

      setListBox({
        top: (above ? rect.top - GAP : rect.bottom + GAP) - containingRect.top,
        left: rect.left - containingRect.left,
        width: rect.width,
        maxHeight,
        above,
      });
      setPortalTarget(target);
    }
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
      const target = event.target as Node;
      // The list is portalled out of the wrapper's own subtree, so a click
      // on one of its options no longer counts as "inside" by DOM structure
      // alone — checked separately here, or every option click would look
      // like an outside click and close the list before `commit` ran.
      if (!wrapperRef.current?.contains(target) && !listRef.current?.contains(target)) {
        setOpen(false);
      }
    }
    // Fixed coordinates go stale as soon as an ancestor scrolls or the window
    // resizes — but the list scrolling inside itself moves nothing, and the
    // capture-phase listener sees that too. Without this guard, scrolling a
    // list long enough to need scrolling closed it on the first wheel tick.
    function onScrollOrResize(event: Event) {
      if (event.type === "scroll" && listRef.current?.contains(event.target as Node)) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    // Attached next frame, not in this same tick: inserting the portalled
    // list can itself fire a "scroll" event (a scrollable dialog ancestor's
    // own scroll-anchoring adjusting for the newly added content) — caught
    // immediately, that reads as a user scroll and closes the list the
    // instant it opens.
    const raf = requestAnimationFrame(() => {
      window.addEventListener("scroll", onScrollOrResize, true);
      window.addEventListener("resize", onScrollOrResize);
    });
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
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
          disabled={disabled}
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
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onTriggerKeyDown}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-surface py-2 pr-2.5 pl-3 text-left text-sm text-foreground shadow-sm transition-colors outline-none hover:bg-black/[.02] focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand disabled:pointer-events-none disabled:opacity-50 dark:hover:bg-white/[.04]"
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronRightIcon className="size-3.5 shrink-0 rotate-90 text-muted" />
      </button>

      {open &&
        listBox &&
        portalTarget &&
        createPortal(
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            tabIndex={-1}
            aria-activedescendant={`${listboxId}-${activeIndex}`}
            onKeyDown={onListKeyDown}
            style={{
              top: listBox.top,
              left: listBox.left,
              width: listBox.width,
              maxHeight: listBox.maxHeight,
            }}
            className={`fixed z-20 min-w-max overflow-auto rounded-md border border-border bg-surface py-1 shadow-lg outline-none ${
              listBox.above ? "-translate-y-full" : ""
            }`}
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
          </ul>,
          portalTarget,
        )}
    </div>
  );
}
