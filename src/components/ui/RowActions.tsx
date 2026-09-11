"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconButton } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Modal";
import { ArrowUpRightIcon, EditIcon, MoreVerticalIcon } from "@/components/icons";

/**
 * The "⋮" button at the end of a table row: a small menu offering Edit, which
 * opens the row's form in a dialog without leaving the list, and Open, which
 * goes to the entity's own page.
 *
 * Menu and dialog live in one component because a render prop can't cross the
 * server/client boundary — the pages that use this are server components, so
 * they can hand over the form as `children` but not a callback to open it.
 *
 * The menu is portalled to `<body>` and positioned from the trigger's box.
 * Rendered in place it was trapped inside the table's scroll container —
 * `overflow-x-auto` makes the other axis scrollable too, so opening the menu
 * on the last row grew the container and produced a scrollbar instead of
 * letting the menu overlap the page.
 */
export function RowActions({
  label,
  title,
  openHref,
  openOnMount = false,
  children,
}: {
  /** Names the row in the trigger's accessible name, e.g. the row's title. */
  label: string;
  /** Heading for the edit dialog. */
  title: string;
  /** The entity's own page. Omit when the entity has no page of its own: the
   * trigger then edits directly, because a menu holding a single item costs
   * two clicks to do what one button already does. */
  openHref?: string;
  /** Reopens the dialog after a failed save redirected back to this list. */
  openOnMount?: boolean;
  /** The edit form. */
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(openOnMount);
  const [menuBox, setMenuBox] = useState<{ top: number; right: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  /** Two menu items plus the list's padding — enough to know whether the menu
   * fits below the trigger without rendering it first. */
  const MENU_HEIGHT = 84;

  /** Measured on click rather than in an effect: the position is a direct
   * consequence of the user's action, and computing it here keeps opening to
   * a single render instead of "open, then correct the position". */
  function toggleMenu() {
    if (menuOpen) {
      setMenuOpen(false);
      setMenuBox(null);
      return;
    }
    // The wrapper hugs the trigger; `IconButton` takes no ref, and this avoids
    // widening a shared component for one caller.
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    const openUpwards = rect.bottom + MENU_HEIGHT > window.innerHeight;
    setMenuBox({
      top: openUpwards ? rect.top - MENU_HEIGHT - 4 : rect.bottom + 4,
      right: window.innerWidth - rect.right,
    });
    setMenuOpen(true);
  }

  useEffect(() => {
    if (!menuOpen) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      // The menu is portalled out, so "inside" now means either element.
      if (!wrapperRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setMenuOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    // Fixed coordinates go stale the moment anything scrolls; closing is
    // honest, and cheaper than tracking the trigger.
    function onScrollOrResize() {
      setMenuOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [menuOpen]);

  const itemClass =
    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-foreground hover:bg-black/[.05] dark:hover:bg-white/[.08] [&>svg]:size-4 [&>svg]:text-muted";

  if (!openHref) {
    // Wrapped, not a fragment: returned bare, the `<dialog>` would become a
    // sibling of the button in whatever row lays these out, and a stray
    // participant in that flex line. Both branches now hand back exactly one
    // element, so the row sees one item either way.
    return (
      <div className="relative">
        <IconButton
          type="button"
          onClick={() => setDialogOpen(true)}
          aria-label={`Edit ${label}`}
          title="Edit"
        >
          <EditIcon />
        </IconButton>
        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={title}>
          {children}
        </Dialog>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <IconButton
        type="button"
        onClick={toggleMenu}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuId}
        aria-label={`Actions for ${label}`}
        title="Actions"
      >
        <MoreVerticalIcon />
      </IconButton>

      {menuOpen &&
        menuBox &&
        createPortal(
          <div
            id={menuId}
            ref={menuRef}
            role="menu"
            style={{ top: menuBox.top, right: menuBox.right }}
            className="fixed z-50 w-40 overflow-hidden rounded-md border border-border bg-surface py-1 shadow-lg"
          >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              setDialogOpen(true);
            }}
            className={itemClass}
          >
            <EditIcon />
            Edit
          </button>
          <Link
            role="menuitem"
            href={openHref}
            onClick={() => setMenuOpen(false)}
            className={itemClass}
          >
              <ArrowUpRightIcon />
              Open
            </Link>
          </div>,
          document.body,
        )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={title}>
        {children}
      </Dialog>
    </div>
  );
}
