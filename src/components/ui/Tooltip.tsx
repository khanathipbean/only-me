"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const SHOW_DELAY_MS = 300;
/** Clearance from the trigger, and from the window's edges. */
const GAP = 8;

/**
 * A small dark label above (or below, near the top edge) a trigger on
 * hover/focus — the styled replacement for a bare `title` attribute, positioned
 * from the trigger's own bounding rect and portalled to `<body>` for the same
 * reason RowActions'/AccountMenu's menus are: a trigger inside a scrolling
 * table cell or a dialog would otherwise clip it against that ancestor's own
 * `overflow`.
 *
 * Purely a visual layer — `IconButton`/`IconLinkButton` still carry their own
 * `aria-label`, which is what a screen reader actually announces regardless
 * of whether this is showing.
 */
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  const [box, setBox] = useState<{ top: number; left: number; above: boolean } | null>(null);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const showTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleShow() {
    if (showTimeout.current) clearTimeout(showTimeout.current);
    showTimeout.current = setTimeout(() => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect) return;
      const above = rect.top > 40;
      setBox({
        top: above ? rect.top - GAP : rect.bottom + GAP,
        left: rect.left + rect.width / 2,
        above,
      });
    }, SHOW_DELAY_MS);
  }

  function hide() {
    if (showTimeout.current) clearTimeout(showTimeout.current);
    setBox(null);
  }

  // Fixed coordinates go stale as soon as anything moves; `hide` is a no-op
  // while nothing is shown, so this can just listen for the component's whole
  // lifetime rather than only while open.
  useEffect(() => {
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      if (showTimeout.current) clearTimeout(showTimeout.current);
    };
  }, []);

  return (
    <span
      ref={wrapperRef}
      className="inline-flex"
      onMouseEnter={scheduleShow}
      onMouseLeave={hide}
      onFocus={scheduleShow}
      onBlur={hide}
    >
      {children}
      {box &&
        createPortal(
          <span
            role="tooltip"
            style={{ top: box.top, left: box.left }}
            className={`pointer-events-none fixed z-50 -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-xs font-medium whitespace-nowrap text-background shadow-lg ${
              box.above ? "-translate-y-full" : ""
            }`}
          >
            {label}
          </span>,
          document.body,
        )}
    </span>
  );
}
