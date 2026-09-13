"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const SHOW_DELAY_MS = 300;
/** Clearance from the trigger, and from the window's edges. */
const GAP = 8;

/**
 * Whether the most recent input was a key press rather than a pointer —
 * shared across every Tooltip instance via one pair of listeners, not one
 * per instance. `onFocus` only shows the tooltip when this is true: closing
 * a dialog returns focus to whatever triggered it (e.g. the row's Edit
 * button), which fires that button's own `onFocus` exactly as a real Tab
 * press would, and without this check its tooltip would pop back up and sit
 * there stuck — the focus is real, but the user never asked to see it.
 */
let usingKeyboard = false;
if (typeof window !== "undefined") {
  window.addEventListener("keydown", () => {
    usingKeyboard = true;
  });
  window.addEventListener("mousedown", () => {
    usingKeyboard = false;
  });
}

/**
 * A small dark label above (or below, near the top edge) a trigger on
 * hover/focus — the styled replacement for a bare `title` attribute, positioned
 * from the trigger's own bounding rect and portalled out for the same reason
 * RowActions'/AccountMenu's menus are: a trigger inside a scrolling table cell
 * would otherwise clip it against that ancestor's own `overflow`.
 *
 * Portals into the nearest open `<dialog>` rather than always `<body>`: a
 * native `<dialog>` shown via `showModal()` is promoted to the browser's own
 * top layer, which paints above all regular DOM content regardless of
 * z-index — a tooltip portalled to `<body>` for a trigger inside that dialog
 * would render, just invisibly, behind it.
 *
 * The dialog's own `backdrop-blur` (see `dialogClass`) means it establishes a
 * containing block of its own — a `position: fixed` descendant resolves its
 * offsets against the dialog's box, not the viewport, once portalled inside
 * it. `top`/`left` are computed relative to whichever box the tooltip will
 * actually be positioned against, so this still lands beside the trigger
 * instead of drifting off to whatever the dialog's own origin happens to be.
 *
 * Purely a visual layer — `IconButton`/`IconLinkButton` still carry their own
 * `aria-label`, which is what a screen reader actually announces regardless
 * of whether this is showing.
 */
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  const [box, setBox] = useState<{ top: number; left: number; above: boolean } | null>(null);
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const showTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleShow() {
    if (showTimeout.current) clearTimeout(showTimeout.current);
    showTimeout.current = setTimeout(() => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect) return;
      const target = wrapperRef.current?.closest("dialog") ?? document.body;
      const containingRect = target === document.body ? { top: 0, left: 0 } : target.getBoundingClientRect();
      // Measured from whichever box the tooltip is actually confined to, not
      // always the viewport: a dialog clips its own overflow (`overflow:
      // auto`), so a trigger sitting near the TOP of the dialog itself (the
      // Close button, say) needs the same "not enough room above" flip that
      // a trigger near the top of the viewport gets — measured against the
      // dialog's own edge, not the window's.
      const above = rect.top - containingRect.top > 40;
      setBox({
        top: (above ? rect.top - GAP : rect.bottom + GAP) - containingRect.top,
        left: rect.left + rect.width / 2 - containingRect.left,
        above,
      });
      setPortalTarget(target);
    }, SHOW_DELAY_MS);
  }

  function hide() {
    if (showTimeout.current) clearTimeout(showTimeout.current);
    setBox(null);
    setPortalTarget(null);
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
      onFocus={() => usingKeyboard && scheduleShow()}
      onBlur={hide}
    >
      {children}
      {box &&
        portalTarget &&
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
          portalTarget,
        )}
    </span>
  );
}
