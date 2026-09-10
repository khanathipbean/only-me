"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!menuOpen) return;

    function onPointerDown(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const itemClass =
    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-foreground hover:bg-black/[.05] dark:hover:bg-white/[.08] [&>svg]:size-4 [&>svg]:text-muted";

  if (!openHref) {
    return (
      <>
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
      </>
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <IconButton
        type="button"
        onClick={() => setMenuOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuId}
        aria-label={`Actions for ${label}`}
        title="Actions"
      >
        <MoreVerticalIcon />
      </IconButton>

      {menuOpen && (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-md border border-border bg-surface py-1 shadow-lg"
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
        </div>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={title}>
        {children}
      </Dialog>
    </div>
  );
}
