"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";

export type NavMenuItem = {
  label: string;
  href: string;
  /** One line saying what the view is for. The pills this replaced carried
   *  names only, and nothing on screen said how two of them differed. */
  detail: string;
  active: boolean;
  icon?: ComponentType<{ className?: string }>;
};

/** How wide the panel is drawn, so it can be kept on screen before it is
 *  drawn at all. Measuring it afterwards would mean one frame in the wrong
 *  place, which on a narrow window is a frame hanging off the edge. */
const LIST_WIDTH = 288;
/* Wider than the list beside it. At the same width the Dashboard's legend
   had to truncate the very words it exists to say — "Pass…", "Skipp…",
   "Not …" — and a label clipped to an ellipsis is worse than no label. */
const PREVIEW_WIDTH = 384;
const VIEWPORT_MARGIN = 8;

/**
 * A menu bar entry that opens a list of the pages behind it.
 *
 * Hover is the quick way in and never the only one. There is no hover on a
 * touch screen, and none for somebody using a keyboard, so the trigger is a
 * real `<button>` that opens on click, on Enter, on Space and on ArrowDown;
 * Escape closes it, as does a click anywhere outside or moving focus out.
 * A control that only answers a pointer is a control half the people using
 * it cannot reach.
 *
 * `CLOSE_DELAY` is the other half of making hover usable: the pointer has
 * to cross a gap between the trigger and the panel hanging below it, and a
 * menu that shuts the instant it leaves the trigger shuts in that gap,
 * every time. A short grace period, cancelled the moment the pointer lands
 * on either, is the whole trick.
 *
 * One component rather than one per menu. There are already six of these
 * written by hand in this app — the account menu, the project picker, the
 * theme toggle, the notification bell, a row's actions and the export
 * button — and each knows a slightly different amount about closing,
 * keyboards and what to tell a screen reader. This is the shape they could
 * share; nothing has been moved onto it yet.
 */
const CLOSE_DELAY = 180;

export function NavMenu({
  label,
  items,
  active,
  className = "",
  activeClassName = "",
  onOpen,
  renderPreview,
}: {
  label: string;
  items: readonly NavMenuItem[];
  /** True when the reader is on any of the pages this entry stands for. */
  active: boolean;
  className?: string;
  activeClassName?: string;
  /** Told every time the menu opens, so the caller can fetch what the
   *  preview needs the first time and never before. */
  onOpen?: () => void;
  /** Draws the pane beside the list, for whichever item the reader is
   *  pointing at. Left out, the menu is the list alone and no wider than it
   *  ever was. */
  renderPreview?: (item: NavMenuItem) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  /* Which item the pane is showing. Follows the pointer and the keyboard
     alike, so arrowing down the list changes the drawing exactly as moving
     the mouse down it does. */
  const [pointed, setPointed] = useState(0);
  /* Where to draw the panel, measured from the trigger when it opens.
     Null until then, which is also how this knows the document exists —
     the portal cannot be built during the server render. */
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* Whether a pointer is resting on the entry. It decides what a click
     means, below. */
  const hovering = useRef(false);
  const menuId = useId();

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  function closeSoon() {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY);
  }

  /* `useCallback` so the effect below can depend on it honestly rather than
     leaving it out of the list and hoping it never changes. */
  const closeNow = useCallback(() => {
    cancelClose();
    setOpen(false);
  }, [cancelClose]);

  useEffect(() => cancelClose, [cancelClose]);

  useEffect(() => {
    if (!open) {
      return;
    }
    /* The panel is portalled out of this component's box, so "inside" means
       either element. Without the second test, a click on a menu item counts
       as a click outside: the menu closes on `mousedown` and the link never
       receives the `click` that was on its way. */
    const inside = (node: Node | null) =>
      Boolean(wrapperRef.current?.contains(node) || panelRef.current?.contains(node));

    function onPointerDown(event: MouseEvent) {
      if (!inside(event.target as Node)) {
        closeNow();
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeNow();
        /* Focus goes back where it came from, or Escape leaves the reader
           nowhere — the panel they were in has just been removed. */
        wrapperRef.current?.querySelector("button")?.focus();
      }
    }
    /* Fixed coordinates go stale the moment anything scrolls. Closing is
       honest, and cheaper than following the trigger around. */
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", closeNow, true);
    window.addEventListener("resize", closeNow);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", closeNow, true);
      window.removeEventListener("resize", closeNow);
    };
  }, [open, closeNow]);

  /** Opens, having first measured where the panel should hang. */
  const show = useCallback(() => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (rect) {
      const width = LIST_WIDTH + (renderPreview ? PREVIEW_WIDTH : 0);
      /* Kept inside the window. The panel hangs from the trigger's left
         edge, and a menu near the right of the bar is twice as wide as the
         one that used to hang there — far enough over to run off. */
      const furthestLeft = Math.max(
        VIEWPORT_MARGIN,
        window.innerWidth - width - VIEWPORT_MARGIN,
      );
      setBox({ top: rect.bottom + 2, left: Math.min(rect.left, furthestLeft) });
    }
    /* Opening lands on the page the reader is already on, where there is
       one, so the drawing beside the list is of where they are. */
    const here = items.findIndex((item) => item.active);
    setPointed(here === -1 ? 0 : here);
    setOpen(true);
    onOpen?.();
  }, [items, onOpen, renderPreview]);

  /** Arrow keys walk the panel; Home and End jump to its ends. */
  function onPanelKeyDown(event: React.KeyboardEvent) {
    const links = Array.from(panelRef.current?.querySelectorAll("a") ?? []);
    if (links.length === 0) {
      return;
    }
    const here = links.indexOf(document.activeElement as HTMLAnchorElement);
    const go = (index: number) => {
      event.preventDefault();
      links[Math.max(0, Math.min(index, links.length - 1))]?.focus();
    };
    switch (event.key) {
      case "ArrowDown":
        return go(here + 1);
      case "ArrowUp":
        return go(here - 1);
      case "Home":
        return go(0);
      case "End":
        return go(links.length - 1);
      default:
        return;
    }
  }

  function openAndFocusFirst() {
    show();
    /* After the panel exists. Without the wait there is nothing to focus,
       and the key that opened the menu does nothing visible. */
    setTimeout(() => panelRef.current?.querySelector("a")?.focus(), 0);
  }

  return (
    <div
      ref={wrapperRef}
      className="relative shrink-0"
      onMouseEnter={() => {
        hovering.current = true;
        cancelClose();
        show();
      }}
      onMouseLeave={() => {
        hovering.current = false;
        closeSoon();
      }}
      /* Moving focus right out of the menu closes it, which is what Tab
         from the last item has to do — `relatedTarget` is where focus is
         going, and null means it left the document entirely. */
      onBlur={(event) => {
        const going = event.relatedTarget as Node | null;
        if (!wrapperRef.current?.contains(going) && !panelRef.current?.contains(going)) {
          closeNow();
        }
      }}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        /* "This section holds the page you are on." The lit colour says
           the same, and a colour is not something a screen reader — or a
           test — can read. */
        aria-current={active ? "true" : undefined}
        onClick={() => {
          /* A click while the pointer is resting here means "I meant that" —
             hover has already opened the menu, and closing it would be an
             answer to something nobody asked. Leaving the entry closes it
             anyway. With no pointer there is no hover to have opened it, so
             a tap is the only way in and a second tap is the way out. */
          if (hovering.current) {
            show();
            return;
          }
          if (open) {
            closeNow();
          } else {
            show();
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openAndFocusFirst();
          }
        }}
        className={`${className} ${active ? activeClassName : ""}`}
      >
        {label}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* Portalled to `<body>`, not drawn here. The tab bar scrolls
          sideways on a narrow screen, which means it clips what overflows
          it — and a panel hanging below the bar overflows it. It opened and
          was invisible. `RowActions` and `Select` are portalled for the same
          reason; the price is fixed coordinates, measured from the trigger
          and abandoned the moment anything scrolls. */}
      {open &&
        box &&
        createPortal(
        <div
          ref={panelRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onPanelKeyDown}
          onMouseEnter={cancelClose}
          onMouseLeave={closeSoon}
          style={{ top: box.top, left: box.left }}
          className="fixed z-30 flex overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
        >
          <div
            style={{ width: LIST_WIDTH }}
            className="flex shrink-0 flex-col gap-0.5 p-1.5"
          >
            {items.map((item, index) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  role="menuitem"
                  aria-current={item.active ? "page" : undefined}
                  onClick={closeNow}
                  /* Pointing and focusing both move the pane. `onFocus`
                     rather than a key handler: the arrow keys already move
                     focus, so one listener covers the mouse, the keyboard
                     and anything else that focuses a link. */
                  onMouseEnter={() => setPointed(index)}
                  onFocus={() => setPointed(index)}
                  className={`flex items-start gap-3 rounded-lg px-2.5 py-2 ${
                    index === pointed
                      ? "bg-black/[.05] dark:bg-white/[.07]"
                      : "hover:bg-black/[.03] dark:hover:bg-white/[.05]"
                  }`}
                >
                  {Icon && (
                    <span
                      className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-black/[.05] dark:bg-white/[.07] [&>svg]:size-4 ${
                        item.active ? "text-brand" : "text-muted"
                      }`}
                    >
                      <Icon />
                    </span>
                  )}
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-semibold text-foreground">{item.label}</span>
                    <span className="text-xs leading-snug text-muted">{item.detail}</span>
                  </span>
                </Link>
              );
            })}
          </div>

          {/* Hidden from a screen reader on purpose. A menu is a list of
              places to go, and this pane repeats what the place itself
              shows — announcing a panel that changes on every arrow key
              would talk over the names the reader is trying to hear. */}
          {renderPreview && items[pointed] && (
            <div
              aria-hidden="true"
              data-testid="nav-menu-preview"
              style={{ width: PREVIEW_WIDTH }}
              className="flex shrink-0 flex-col border-l border-border bg-background p-4"
            >
              {renderPreview(items[pointed])}
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
